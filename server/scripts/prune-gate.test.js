import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  emptyGate,
  readBoardState,
  recordObservation,
  describeGate,
  UNLOCK,
} from "./prune-gate.mjs";
import { planUpdate } from "./update-words.mjs";

function runDays(count, perDay, { gate = emptyGate(), board = "mini", contradictionsOn = {} } = {}) {
  const transitions = [];
  for (let d = 1; d <= count; d++) {
    const date = `2026-09-${String(d).padStart(2, "0")}`;
    const result = recordObservation(gate, board, {
      date,
      observations: perDay,
      contradictions: contradictionsOn[d] || [],
    });
    gate = result.gate;
    if (result.transition) transitions.push({ date, transition: result.transition });
  }
  return { gate, state: readBoardState(gate, board), transitions };
}

describe("prune gate", () => {
  it("starts locked", () => {
    assert.equal(readBoardState(emptyGate(), "mini").pruneEnabled, false);
  });

  it("unlocks only after both thresholds are met", () => {
    // Enough observations, too few days
    const fast = runDays(3, 50);
    assert.equal(fast.state.pruneEnabled, false);
    assert.ok(fast.state.observations >= UNLOCK.observations);

    // Enough days, too few observations
    const slow = runDays(UNLOCK.days + 2, 1);
    assert.equal(slow.state.pruneEnabled, false);

    const both = runDays(UNLOCK.days, Math.ceil(UNLOCK.observations / UNLOCK.days));
    assert.equal(both.state.pruneEnabled, true);
    assert.deepEqual(
      both.transitions.map((t) => t.transition),
      ["unlocked"]
    );
  });

  it("a single contradiction resets the streak before unlocking", () => {
    const { state } = runDays(10, 10, { contradictionsOn: { 9: ["cat"] } });
    assert.equal(state.pruneEnabled, false);
    assert.equal(state.observations, 10); // only day 10 survived
    assert.equal(state.days, 1);
    assert.deepEqual(state.lastContradiction.words, ["cat"]);
  });

  it("re-locks an unlocked board when a contradiction appears", () => {
    const unlocked = runDays(UNLOCK.days, UNLOCK.observations);
    assert.equal(unlocked.state.pruneEnabled, true);

    const after = recordObservation(unlocked.gate, "mini", {
      date: "2026-10-01",
      observations: 12,
      contradictions: ["tola"],
    });
    assert.equal(after.state.pruneEnabled, false);
    assert.equal(after.transition, "relocked");
    assert.equal(after.state.relockedOn, "2026-10-01");
    assert.equal(after.state.observations, 0);
  });

  it("a day with no observations neither advances nor breaks the streak", () => {
    const before = runDays(3, 5);
    const after = recordObservation(before.gate, "mini", { date: "2026-09-09", observations: 0 });
    assert.equal(after.state.observations, before.state.observations);
    assert.equal(after.state.days, before.state.days);
    assert.equal(after.transition, null);
  });

  it("keeps boards independent", () => {
    let gate = runDays(UNLOCK.days, UNLOCK.observations).gate;
    gate = recordObservation(gate, "classic", {
      date: "2026-10-01",
      observations: 5,
      contradictions: ["oops"],
    }).gate;
    assert.equal(readBoardState(gate, "mini").pruneEnabled, true);
    assert.equal(readBoardState(gate, "classic").pruneEnabled, false);
  });

  it("reports progress and the reason it is still locked", () => {
    const { state } = runDays(2, 5);
    const text = describeGate("mini", state);
    assert.match(text, /10\/40 observations over 2\/7 days/);
    assert.match(text, /30 more observations and 5 more days/);
  });
});

describe("evidence produced by planUpdate", () => {
  const confirmed = ["cat", "dog", "owl"];

  it("counts confirmed words the solver placed on the grid", () => {
    const plan = planUpdate({
      actual: ["cat", "dog", "owl", "new"],
      predicted: ["cat", "dog", "owl", "junk"],
      confirmed,
    });
    assert.deepEqual(plan.confirmedPredicted, ["cat", "dog", "owl"]);
    assert.deepEqual(plan.confirmedContradictions, []);
  });

  it("flags a confirmed word the answer list omitted", () => {
    const plan = planUpdate({
      actual: ["cat", "dog"],
      predicted: ["cat", "dog", "owl"],
      confirmed,
    });
    assert.deepEqual(plan.confirmedContradictions, ["owl"]);
  });

  it("marks a thin scrape's evidence unusable so it cannot re-lock a board", () => {
    const thin = planUpdate({
      actual: ["cat"],
      predicted: ["cat", "dog", "owl"],
      confirmed,
    });
    assert.deepEqual(thin.confirmedContradictions, ["dog", "owl"]);
    assert.equal(thin.evidenceUsable, false);
  });

  it("marks evidence unusable when the solver produced nothing", () => {
    const plan = planUpdate({
      actual: Array.from({ length: 40 }, (_, i) => `w${"o".repeat(i + 1)}rd`),
      predicted: [],
      confirmed,
    });
    assert.equal(plan.evidenceUsable, false);
  });

  it("marks a full scrape's evidence usable", () => {
    const plan = planUpdate({
      actual: Array.from({ length: 40 }, (_, i) => `w${"o".repeat(i + 1)}rd`),
      predicted: ["cat"],
      confirmed,
    });
    assert.equal(plan.evidenceUsable, true);
  });
});
