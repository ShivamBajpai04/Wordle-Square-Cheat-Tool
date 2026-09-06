import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

export const GATE_PATH = path.join(REPO_ROOT, "stats/prune-gate.json");
export const GATE_VERSION = 1;

// How much evidence unlocks pruning on a board whose answer list has not been
// shown to be exhaustive.
//
// An observation is one confirmed-vocabulary word the solver placed on that
// day's grid. If the published list were a curated subset omitting even 10% of
// valid words, surviving 40 observations with zero omissions has probability
// 0.9^40 ≈ 1.5%; a heavier curation is ruled out overwhelmingly. The day floor
// stops one unusually complete board from unlocking on its own.
export const UNLOCK = { observations: 40, days: 7 };

export function emptyGate() {
  return { version: GATE_VERSION, boards: {} };
}

function emptyBoard() {
  return {
    pruneEnabled: false,
    observations: 0,
    days: 0,
    firstObserved: null,
    lastObserved: null,
    lastContradiction: null,
    unlockedOn: null,
    relockedOn: null,
  };
}

export function readBoardState(gate, board) {
  return { ...emptyBoard(), ...(gate?.boards?.[board] || {}) };
}

/**
 * Folds one day's evidence into a board's state and re-decides whether pruning
 * is allowed. Pure: `decideAllowPrune` reads the state as it stood *before*
 * today, so a day can never be the evidence that justifies its own pruning.
 */
export function recordObservation(
  gate,
  board,
  { date, observations = 0, contradictions = [], unlock = UNLOCK }
) {
  const before = readBoardState(gate, board);
  const next = { ...before };

  if (contradictions.length > 0) {
    // Proof the list is not exhaustive. Reset rather than decay: the streak is
    // meant to be an unbroken run of clean observations.
    next.observations = 0;
    next.days = 0;
    next.firstObserved = null;
    next.lastContradiction = { date, words: [...contradictions] };
    if (before.pruneEnabled) {
      next.pruneEnabled = false;
      next.relockedOn = date;
      next.unlockedOn = null;
    }
  } else if (observations > 0) {
    next.observations = before.observations + observations;
    next.days = before.days + 1;
    next.firstObserved = before.firstObserved || date;
    if (
      !next.pruneEnabled &&
      next.observations >= unlock.observations &&
      next.days >= unlock.days
    ) {
      next.pruneEnabled = true;
      next.unlockedOn = date;
      next.relockedOn = null;
    }
  }

  // A day with no observations and no contradictions carries no evidence, so
  // it neither advances nor breaks the streak.
  if (observations > 0 || contradictions.length > 0) next.lastObserved = date;

  const transition =
    next.pruneEnabled === before.pruneEnabled
      ? null
      : next.pruneEnabled
      ? "unlocked"
      : "relocked";

  return {
    gate: {
      version: GATE_VERSION,
      boards: { ...(gate?.boards || {}), [board]: next },
    },
    state: next,
    transition,
  };
}

export function describeGate(board, state, unlock = UNLOCK) {
  if (state.pruneEnabled) {
    return `pruning enabled for ${board} since ${state.unlockedOn} (${state.observations} clean observations over ${state.days} days)`;
  }
  const need = [];
  if (state.observations < unlock.observations) {
    need.push(`${unlock.observations - state.observations} more observations`);
  }
  if (state.days < unlock.days) {
    need.push(`${unlock.days - state.days} more days`);
  }
  const progress = `${state.observations}/${unlock.observations} observations over ${state.days}/${unlock.days} days`;
  const because = state.lastContradiction
    ? ` Last contradiction ${state.lastContradiction.date}: ${state.lastContradiction.words.join(", ")}.`
    : "";
  return `${board} is add-only — ${progress}, needs ${need.join(" and ")}.${because}`;
}

export async function loadGate(file = GATE_PATH) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return parsed?.boards ? parsed : emptyGate();
  } catch {
    return emptyGate();
  }
}

export async function saveGate(gate, file = GATE_PATH) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(gate, null, 2) + "\n");
}
