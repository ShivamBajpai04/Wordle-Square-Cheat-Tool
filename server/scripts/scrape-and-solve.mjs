import fs from "fs/promises";
import { pathToFileURL } from "url";
import { get_game_data } from "../pupeteer.js";
import { runSolver } from "./solver.mjs";

export const BOARDS = {
  classic: { url: "https://squares.org/", cells: 16, depth: 16 },
  mini: { url: "https://squares.org/mini", cells: 9, depth: 9 },
};

function parseArgs(argv) {
  const args = { board: "classic" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--board") args.board = argv[++i];
    else if (argv[i] === "--out-actual") args.outActual = argv[++i];
    else if (argv[i] === "--out-predicted") args.outPredicted = argv[++i];
  }
  args.outActual ??= `actual-words-${args.board}.txt`;
  args.outPredicted ??= `predictions-${args.board}.txt`;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const board = BOARDS[args.board];
  if (!board) {
    console.error(`Unknown board "${args.board}". Expected one of: ${Object.keys(BOARDS).join(", ")}`);
    process.exit(2);
  }

  const data = await get_game_data(board.url);

  // /mini silently redirects to the classic board when it is unavailable, so
  // confirm the grid size before trusting anything scraped from it. Merging
  // classic answers into the mini run would poison a bank whose whole value is
  // that every entry is a confirmed answer for that board.
  const cells = (data.yesterdaysGrid || "").trim().split(/\s+/).filter(Boolean);
  const gridIsValid = cells.length === board.cells;

  if (!gridIsValid && cells.length > 0) {
    console.log(
      `⚠️ Expected a ${board.cells}-cell ${args.board} board but saw ${cells.length}; discarding this scrape`
    );
    await fs.writeFile(args.outActual, "");
    await fs.writeFile(args.outPredicted, "");
    return;
  }

  const answers = data.yesterdayWords || [];
  console.log(
    `${args.board}: ${answers.length} answers ` +
      `(${data.mainWords?.length ?? 0} main + ${data.bonusWords?.length ?? 0} bonus), ` +
      `grid ${gridIsValid ? cells.join(" ") : "not extracted"}`
  );
  await fs.writeFile(args.outActual, answers.join(" "));

  // Without predictions the updater can only add, never prune — which is the
  // correct behaviour when the solver could not run.
  if (!gridIsValid) {
    console.log("⚠️ No usable grid; skipping the solve (dictionary will be add-only)");
    await fs.writeFile(args.outPredicted, "");
    return;
  }

  try {
    const predictions = await runSolver(cells.join(" "), board.depth);
    console.log(`${args.board}: solver predicted ${predictions.length} words`);
    await fs.writeFile(args.outPredicted, predictions.join(" "));
  } catch (error) {
    console.error(`⚠️ Solver failed (${error.message}); dictionary will be add-only`);
    await fs.writeFile(args.outPredicted, "");
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
