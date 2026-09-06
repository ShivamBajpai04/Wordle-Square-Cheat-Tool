import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  GATE_PATH,
  loadGate,
  saveGate,
  readBoardState,
  recordObservation,
  describeGate,
} from "./prune-gate.mjs";
import { sendTelegram } from "./notify.mjs";

const SERVER_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export const WORDS_PATH = path.join(SERVER_ROOT, "words.txt");
// Every word the game itself has ever shown as an official answer (main or
// bonus, classic or mini). Pruning may never delete from this set: the daily
// answer list is our only evidence, and it is not always complete.
export const CONFIRMED_PATH = path.join(SERVER_ROOT, "confirmed-words.txt");

// A thin scrape (bonus list missed, modal half-loaded) would treat real answers
// as false positives. The floor catches a scrape that returned almost nothing;
// the confirmed allowlist catches the partial scrapes the floor cannot see.
export const MIN_ACTUAL_FOR_PRUNE = { classic: 30, mini: 8 };

export function normalize(words) {
  return (words || [])
    .map((w) => String(w).trim().toLowerCase())
    .filter((w) => /^[a-z]+$/.test(w));
}

/**
 * Decides what the day's scrape should do to the dictionary. Pure so the rules
 * that can delete 90k words are testable without a browser or a solver.
 */
export function planUpdate({
  actual = [],
  predicted = [],
  current = [],
  confirmed = [],
  board = "classic",
  allowPrune = true,
  minActualForPrune = MIN_ACTUAL_FOR_PRUNE[board] ?? MIN_ACTUAL_FOR_PRUNE.classic,
} = {}) {
  const actualSet = new Set(normalize(actual));
  const predictedSet = new Set(normalize(predicted));
  const currentSet = new Set(normalize(current));
  const confirmedSet = new Set(normalize(confirmed));

  const wordsToAdd = [...actualSet].filter((w) => !currentSet.has(w)).sort();
  const falsePositives = [...predictedSet].filter((w) => !actualSet.has(w)).sort();

  // No predictions means the solver failed, not that everything it knows is
  // wrong. Add-only in that case.
  const solverRan = predictedSet.size > 0;
  const scrapeLooksComplete = actualSet.size >= minActualForPrune;
  const prune = allowPrune && solverRan && scrapeLooksComplete;

  // Computed even when pruning is off, so an add-only run still reports what it
  // would have deleted.
  const prunable = (solverRan ? falsePositives : []).filter((w) => currentSet.has(w));
  const protectedFromPrune = prunable.filter((w) => confirmedSet.has(w));
  const prunableUnconfirmed = prunable.filter((w) => !confirmedSet.has(w));
  const wordsToRemove = prune ? prunableUnconfirmed : [];

  // Confirmed grows with every scrape, including words already in words.txt.
  const newlyConfirmed = [...actualSet].filter((w) => !confirmedSet.has(w)).sort();

  // Evidence about whether this board's published answer list is exhaustive.
  // Both boards share one vocabulary, so a word the game has confirmed before,
  // which the solver says is spellable on today's grid, must appear in today's
  // answers. Each such word is one observation; one that is missing is proof
  // the list is a curated subset, and pruning against it would delete valid
  // words. Deliberately independent of words.txt: this measures the answer
  // list, not the dictionary.
  const confirmedPredicted = [...predictedSet].filter((w) => confirmedSet.has(w)).sort();
  const confirmedContradictions = confirmedPredicted.filter((w) => !actualSet.has(w));

  // A thin scrape makes every real answer look like a contradiction, which
  // would wrongly re-lock the board. Only a run that cleared the floor and had
  // a working solver produces usable evidence.
  const evidenceUsable = solverRan && scrapeLooksComplete;
  const evidenceReason = evidenceUsable
    ? null
    : !solverRan
    ? "solver produced nothing"
    : `thin scrape (${actualSet.size} answers, floor ${minActualForPrune})`;

  return {
    board,
    prune,
    skipReason: prune
      ? null
      : !allowPrune
      ? "add-only mode"
      : !solverRan
      ? "no predictions (solver produced nothing)"
      : `thin scrape (${actualSet.size} answers, floor ${minActualForPrune})`,
    wouldRemove: prunableUnconfirmed,
    totalActual: actualSet.size,
    totalPredicted: predictedSet.size,
    wordsToAdd,
    wordsToRemove,
    falsePositives,
    protectedFromPrune,
    newlyConfirmed,
    confirmedPredicted,
    confirmedContradictions,
    evidenceUsable,
    evidenceReason,
    updatedWords: [...new Set([...currentSet, ...wordsToAdd])]
      .filter((w) => !wordsToRemove.includes(w))
      .sort(),
    updatedConfirmed: [...new Set([...confirmedSet, ...actualSet])].sort(),
  };
}

export function formatCommitMessage(plan) {
  const { board, wordsToAdd, wordsToRemove, falsePositives, protectedFromPrune } = plan;
  const label = board === "mini" ? "mini" : "classic";

  const headline =
    wordsToAdd.length > 0 && wordsToRemove.length > 0
      ? `Update words.txt (${label}): added ${wordsToAdd.length} words, removed ${wordsToRemove.length} false positives`
      : wordsToAdd.length > 0
      ? `Update words.txt (${label}): added ${wordsToAdd.length} new words`
      : `Update words.txt (${label}): removed ${wordsToRemove.length} false positives`;

  const lines = [headline, ""];
  if (wordsToAdd.length > 0) lines.push(`Added: ${wordsToAdd.join(", ")}`);
  if (wordsToRemove.length > 0) lines.push(`Removed: ${wordsToRemove.join(", ")}`);
  if (protectedFromPrune.length > 0) {
    lines.push(
      `Kept (previously confirmed answers, not pruned): ${protectedFromPrune.join(", ")}`
    );
  }

  const otherFalsePositives = falsePositives.filter(
    (w) => !wordsToRemove.includes(w) && !protectedFromPrune.includes(w)
  );
  if (otherFalsePositives.length > 0) {
    lines.push(
      `Other false positives (not in words.txt): ${otherFalsePositives.join(", ")}`
    );
  }

  return lines.join("\n") + "\n";
}

export async function readWordFile(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.trim().split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeWordFile(file, words) {
  await fs.writeFile(file, words.join("\n") + "\n");
}

/**
 * Reads the dictionary, applies the plan and writes it back. Returns the plan
 * so callers can report on it. `dryRun` leaves every file untouched.
 */
export async function applyUpdate({
  actual,
  predicted = [],
  board = "classic",
  allowPrune = true,
  dryRun = false,
  wordsPath = WORDS_PATH,
  confirmedPath = CONFIRMED_PATH,
}) {
  const current = await readWordFile(wordsPath);
  const confirmed = await readWordFile(confirmedPath);
  const plan = planUpdate({ actual, predicted, current, confirmed, board, allowPrune });

  if (!dryRun) {
    if (plan.wordsToAdd.length > 0 || plan.wordsToRemove.length > 0) {
      await writeWordFile(wordsPath, plan.updatedWords);
    }
    if (plan.newlyConfirmed.length > 0) {
      await writeWordFile(confirmedPath, plan.updatedConfirmed);
    }
  }

  return plan;
}

export function summarize(plan, { before, after }) {
  return [
    `Board: ${plan.board}`,
    `Official answers scraped: ${plan.totalActual}, predicted: ${plan.totalPredicted}`,
    plan.prune
      ? `Pruning enabled`
      : `⚠️ Pruning skipped — ${plan.skipReason}` +
        (plan.wouldRemove.length
          ? ` (would have removed ${plan.wouldRemove.length}: ${plan.wouldRemove.join(", ")})`
          : ""),
    `Added: ${plan.wordsToAdd.length}${plan.wordsToAdd.length ? ` (${plan.wordsToAdd.join(", ")})` : ""}`,
    `Removed: ${plan.wordsToRemove.length}${plan.wordsToRemove.length ? ` (${plan.wordsToRemove.join(", ")})` : ""}`,
    plan.protectedFromPrune.length > 0
      ? `🛡️ Kept ${plan.protectedFromPrune.length} confirmed answer(s) the solver flagged as false positives: ${plan.protectedFromPrune.join(", ")}`
      : null,
    `Dictionary: ${before} -> ${after}`,
    `Confirmed answers on record: ${plan.updatedConfirmed.length}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseArgs(argv) {
  const args = { board: "classic", dryRun: false, allowPrune: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--actual") args.actual = argv[++i];
    else if (arg === "--predicted") args.predicted = argv[++i];
    else if (arg === "--board") args.board = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
    // Reports what it would prune without deleting anything. Use it on a board
    // whose answer list has not yet been shown to be exhaustive.
    else if (arg === "--add-only") args.allowPrune = false;
    // --gate lets the accumulated evidence decide whether this board may prune,
    // and records today's evidence. --observe records without governing, which
    // is how the already-trusted classic board acts as a control.
    else if (arg === "--gate") args.gate = argv[++i] || GATE_PATH;
    else if (arg === "--observe") {
      args.gate = argv[++i] || GATE_PATH;
      args.observeOnly = true;
    }
    else if (arg === "--commit-msg") args.commitMsg = argv[++i];
    // Point the run at copies of the dictionary. Lets a full run be rehearsed,
    // gate included, without touching the real files.
    else if (arg === "--words") args.wordsPath = argv[++i];
    else if (arg === "--confirmed") args.confirmedPath = argv[++i];
  }
  return args;
}

/**
 * Folds today's evidence into the prune gate and announces any change in
 * whether the board is trusted to prune. An automatic unlock is exactly the
 * kind of change that should not happen silently, so transitions are pushed.
 */
async function updateGate(args, plan) {
  const gate = await loadGate(args.gate);
  const date = new Date().toISOString().slice(0, 10);

  if (!plan.evidenceUsable) {
    console.log(
      `Prune gate: no usable evidence today (${plan.evidenceReason}); ` +
        describeGate(args.board, readBoardState(gate, args.board))
    );
    return;
  }

  const { gate: nextGate, state, transition } = recordObservation(gate, args.board, {
    date,
    observations: plan.confirmedPredicted.length,
    contradictions: plan.confirmedContradictions,
  });

  console.log(`Prune gate: ${describeGate(args.board, state)}`);

  if (!args.dryRun) await saveGate(nextGate, args.gate);

  if (!transition) return;

  const message =
    transition === "unlocked"
      ? [
          `🔓 Pruning unlocked for the ${args.board} board`,
          date,
          "",
          `${state.observations} confirmed words placed on ${state.days} boards were all listed in the published answers.`,
          "That board's answer lists look exhaustive, so false positives will now be pruned from words.txt.",
          "Previously confirmed answers stay protected regardless.",
        ].join("\n")
      : [
          `🔒 Pruning re-locked for the ${args.board} board`,
          date,
          "",
          `The published answers omitted ${state.lastContradiction.words.length} word(s) the game has confirmed before: ${state.lastContradiction.words.join(", ")}.`,
          "The answer list is not exhaustive, so the board is add-only again until the evidence rebuilds.",
        ].join("\n");

  console.log(message);
  await sendTelegram(message).catch((error) =>
    console.error("⚠️ Failed to send gate notification:", error.message)
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.actual) {
    console.error(
      "Usage: node scripts/update-words.mjs --actual <file> [--predicted <file>] " +
        "[--board classic|mini] [--commit-msg <file>] [--gate <file>] [--observe <file>] " +
        "[--words <file>] [--confirmed <file>] [--add-only] [--dry-run]"
    );
    process.exit(2);
  }

  const actual = await readWordFile(args.actual);
  if (actual.length === 0) {
    console.log("No official answers found; leaving the dictionary unchanged");
    return;
  }

  const predicted = args.predicted ? await readWordFile(args.predicted) : [];
  const wordsPath = args.wordsPath || WORDS_PATH;
  const confirmedPath = args.confirmedPath || CONFIRMED_PATH;
  const before = (await readWordFile(wordsPath)).length;

  // The gate is read before the run and written after, so today's evidence can
  // never be what justifies today's pruning.
  const gate = args.gate ? await loadGate(args.gate) : null;
  const gateState = gate ? readBoardState(gate, args.board) : null;
  const allowPrune =
    args.allowPrune && (!gate || args.observeOnly || gateState.pruneEnabled);

  const plan = await applyUpdate({
    actual,
    predicted,
    board: args.board,
    allowPrune,
    dryRun: args.dryRun,
    wordsPath,
    confirmedPath,
  });

  console.log(summarize(plan, { before, after: plan.updatedWords.length }));

  if (gate) {
    await updateGate(args, plan);
  }

  if (
    args.commitMsg &&
    !args.dryRun &&
    (plan.wordsToAdd.length > 0 || plan.wordsToRemove.length > 0)
  ) {
    await fs.writeFile(args.commitMsg, formatCommitMessage(plan));
  }
}

// process.argv[1] is undefined under `node -e`/`node --test`, where this module
// is imported rather than run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
