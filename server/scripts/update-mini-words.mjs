import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { get_game_data } from "../pupeteer.js";

const MINI_URL = "https://squares.org/mini";
const MINI_CELLS = 9;

// Both boards share one vocabulary, so mini answers feed the same dictionary.
// Classic can't be harmed by the 3-letter entries: its solver only records
// paths of 4+, so they are never predicted and therefore never pruned.
const WORDS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../words.txt"
);

async function readExisting() {
  try {
    const raw = await fs.readFile(WORDS_PATH, "utf8");
    return raw.trim().split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

async function main() {
  const data = await get_game_data(MINI_URL);

  // /3x3 silently redirects to the classic board, so confirm the grid really is
  // 3x3 before trusting these answers. Merging classic words would quietly
  // poison a bank whose whole value is that every entry is a confirmed answer.
  const cells = (data.yesterdaysGrid || "").trim().split(/\s+/).filter(Boolean);
  if (cells.length !== MINI_CELLS) {
    console.log(
      `⚠️ Expected a ${MINI_CELLS}-cell mini board but saw ${cells.length}; leaving words.txt unchanged`
    );
    return;
  }

  const scraped = (data.yesterdayWords || [])
    .map((w) => w.trim().toLowerCase())
    .filter((w) => /^[a-z]+$/.test(w));

  if (scraped.length === 0) {
    console.log("⚠️ No mini answers scraped; leaving words.txt unchanged");
    return;
  }

  // Additive only: every entry is an answer the game itself accepted, so unlike
  // the classic flow there is nothing here to prune.
  const existing = await readExisting();
  const merged = [...new Set([...existing, ...scraped])].sort();
  const added = merged.length - existing.length;

  await fs.writeFile(WORDS_PATH, merged.join("\n") + "\n");

  console.log(
    `Mini grid: ${cells.join(" ")}\n` +
      `Scraped ${scraped.length} answers (${data.mainWords?.length ?? 0} main + ${data.bonusWords?.length ?? 0} bonus)\n` +
      `Dictionary: ${existing.length} -> ${merged.length} (+${added} new)`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
