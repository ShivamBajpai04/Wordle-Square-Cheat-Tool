import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  planUpdate,
  applyUpdate,
  formatCommitMessage,
  MIN_ACTUAL_FOR_PRUNE,
} from "./update-words.mjs";

// A scrape big enough to clear the classic prune floor
function fatScrape(extra = []) {
  return [...Array.from({ length: 40 }, (_, i) => `word${"a".repeat(i + 1)}`), ...extra];
}

describe("planUpdate", () => {
  it("adds official answers the dictionary is missing", () => {
    const plan = planUpdate({
      actual: fatScrape(["zesty"]),
      predicted: ["zesty"],
      current: ["zesty"],
    });
    assert.ok(plan.wordsToAdd.includes("worda"));
    assert.ok(!plan.wordsToAdd.includes("zesty"));
  });

  it("removes false positives that are in the dictionary", () => {
    const plan = planUpdate({
      actual: fatScrape(),
      predicted: ["bogus", "worda"],
      current: ["bogus", "worda"],
    });
    assert.deepEqual(plan.wordsToRemove, ["bogus"]);
  });

  it("never removes a word the game has confirmed before", () => {
    const plan = planUpdate({
      actual: fatScrape(),
      predicted: ["tiarella"],
      current: ["tiarella"],
      confirmed: ["tiarella"],
    });
    assert.deepEqual(plan.wordsToRemove, []);
    assert.deepEqual(plan.protectedFromPrune, ["tiarella"]);
  });

  it("skips pruning on a thin scrape but still adds", () => {
    const plan = planUpdate({
      actual: ["alpha", "beta"],
      predicted: ["gamma"],
      current: ["gamma"],
    });
    assert.equal(plan.prune, false);
    assert.deepEqual(plan.wordsToRemove, []);
    assert.deepEqual(plan.wordsToAdd, ["alpha", "beta"]);
    assert.match(plan.skipReason, /thin scrape/);
  });

  it("skips pruning when the solver produced no predictions", () => {
    const plan = planUpdate({
      actual: fatScrape(),
      predicted: [],
      current: ["bogus"],
    });
    assert.equal(plan.prune, false);
    assert.deepEqual(plan.wordsToRemove, []);
    assert.match(plan.skipReason, /no predictions/);
  });

  it("uses a lower prune floor for the mini board", () => {
    const actual = Array.from({ length: MIN_ACTUAL_FOR_PRUNE.mini }, (_, i) => `mini${"x".repeat(i + 1)}`);
    const mini = planUpdate({ actual, predicted: ["junk"], current: ["junk"], board: "mini" });
    const classic = planUpdate({ actual, predicted: ["junk"], current: ["junk"], board: "classic" });
    assert.equal(mini.prune, true);
    assert.equal(classic.prune, false);
  });

  it("records every scraped answer as confirmed, including known ones", () => {
    const plan = planUpdate({
      actual: ["alpha", "beta"],
      current: ["alpha", "beta"],
      confirmed: ["alpha"],
    });
    assert.deepEqual(plan.newlyConfirmed, ["beta"]);
    assert.deepEqual(plan.updatedConfirmed, ["alpha", "beta"]);
  });

  it("normalizes case and ignores non-alphabetic tokens", () => {
    const plan = planUpdate({ actual: ["ALPHA", "b3ta", "  gamma "], current: [] });
    assert.deepEqual(plan.wordsToAdd, ["alpha", "gamma"]);
  });

  it("never both adds and removes the same word", () => {
    const plan = planUpdate({
      actual: fatScrape(["shared"]),
      predicted: ["shared"],
      current: [],
    });
    assert.ok(plan.wordsToAdd.includes("shared"));
    assert.ok(!plan.wordsToRemove.includes("shared"));
    assert.ok(plan.updatedWords.includes("shared"));
  });

  it("leaves the dictionary sorted and deduplicated", () => {
    const plan = planUpdate({ actual: ["cat"], current: ["dog", "cat", "dog"] });
    assert.deepEqual(plan.updatedWords, ["cat", "dog"]);
  });
});

describe("applyUpdate", () => {
  async function tmpFiles(words, confirmed) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "words-test-"));
    const wordsPath = path.join(dir, "words.txt");
    const confirmedPath = path.join(dir, "confirmed-words.txt");
    await fs.writeFile(wordsPath, words.join("\n") + "\n");
    await fs.writeFile(confirmedPath, confirmed.join("\n") + "\n");
    return { wordsPath, confirmedPath };
  }

  it("writes both files and protects confirmed words on disk", async () => {
    const { wordsPath, confirmedPath } = await tmpFiles(["bogus", "tiarella"], ["tiarella"]);
    await applyUpdate({
      actual: fatScrape(),
      predicted: ["bogus", "tiarella"],
      wordsPath,
      confirmedPath,
    });

    const words = (await fs.readFile(wordsPath, "utf8")).trim().split("\n");
    assert.ok(!words.includes("bogus"));
    assert.ok(words.includes("tiarella"));

    const confirmed = (await fs.readFile(confirmedPath, "utf8")).trim().split("\n");
    assert.ok(confirmed.includes("worda"));
    assert.ok(confirmed.includes("tiarella"));
  });

  it("dryRun leaves the files untouched", async () => {
    const { wordsPath, confirmedPath } = await tmpFiles(["bogus"], []);
    await applyUpdate({
      actual: fatScrape(),
      predicted: ["bogus"],
      wordsPath,
      confirmedPath,
      dryRun: true,
    });
    assert.equal((await fs.readFile(wordsPath, "utf8")).trim(), "bogus");
    assert.equal((await fs.readFile(confirmedPath, "utf8")).trim(), "");
  });
});

describe("formatCommitMessage", () => {
  it("reports adds, removes and protected words", () => {
    const plan = planUpdate({
      actual: fatScrape(),
      predicted: ["bogus", "tiarella"],
      current: ["bogus", "tiarella"],
      confirmed: ["tiarella"],
    });
    const msg = formatCommitMessage(plan);
    assert.match(msg, /removed 1 false positives/);
    assert.match(msg, /Removed: bogus/);
    assert.match(msg, /Kept \(previously confirmed answers, not pruned\): tiarella/);
  });
});

describe("--add-only mode", () => {
  it("reports what it would prune without removing anything", () => {
    const plan = planUpdate({
      actual: fatScrape(),
      predicted: ["bogus"],
      current: ["bogus"],
      allowPrune: false,
    });
    assert.equal(plan.prune, false);
    assert.deepEqual(plan.wordsToRemove, []);
    assert.deepEqual(plan.wouldRemove, ["bogus"]);
    assert.ok(plan.updatedWords.includes("bogus"));
    assert.equal(plan.skipReason, "add-only mode");
  });

  it("still adds new answers", () => {
    const plan = planUpdate({ actual: ["alpha"], current: [], allowPrune: false });
    assert.deepEqual(plan.wordsToAdd, ["alpha"]);
  });
});
