import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HISTORY_PATH = path.join(REPO_ROOT, "stats/history.json");
const MAX_WORDS_LISTED = 15;

async function readWordList(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.trim().split(/\s+/).filter(Boolean).map((w) => w.toLowerCase());
  } catch {
    return [];
  }
}

async function loadHistory() {
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveHistory(history) {
  await fs.mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  await fs.writeFile(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");
}

function pct(numerator, denominator) {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function computeStats(actualWords, predictedWords, dictionaryWords) {
  const actual = new Set(actualWords);
  const predicted = new Set(predictedWords);
  const dictionary = new Set(dictionaryWords);

  const hits = [...actual].filter((w) => predicted.has(w));
  const missed = [...actual].filter((w) => !predicted.has(w));
  const falsePositives = [...predicted].filter((w) => !actual.has(w));

  // Mirrors the dictionary update step so the report stays accurate even if
  // that step is skipped or fails
  const wordsToAdd = [...actual].filter((w) => !dictionary.has(w));
  const wordsToRemove = falsePositives.filter((w) => dictionary.has(w));

  return {
    totalActual: actual.size,
    totalPredicted: predicted.size,
    hits: hits.length,
    missed: missed.length,
    falsePositives: falsePositives.length,
    recall: pct(hits.length, actual.size),
    precision: pct(hits.length, predicted.size),
    missedWords: missed.sort(),
    falsePositiveWords: falsePositives.sort(),
    dictionaryAdded: wordsToAdd.length,
    dictionaryRemoved: wordsToRemove.length,
  };
}

function formatDelta(current, previous) {
  if (current === null || previous === null || previous === undefined) return "";
  const diff = Math.round((current - previous) * 10) / 10;
  if (diff === 0) return " (no change)";
  return diff > 0 ? ` (▲ ${diff}%)` : ` (▼ ${Math.abs(diff)}%)`;
}

function truncateList(words) {
  if (words.length === 0) return "none";
  if (words.length <= MAX_WORDS_LISTED) return words.join(", ");
  return `${words.slice(0, MAX_WORDS_LISTED).join(", ")} … +${
    words.length - MAX_WORDS_LISTED
  } more`;
}

export function buildMessage(date, stats, previous) {
  const recall = stats.recall === null ? "n/a" : `${stats.recall}%`;
  const precision = stats.precision === null ? "n/a" : `${stats.precision}%`;

  return [
    "📊 Squares Solver — Daily Report",
    date,
    "",
    "🎯 Accuracy",
    `Recall: ${recall}${formatDelta(stats.recall, previous?.recall)}`,
    `Precision: ${precision}${formatDelta(stats.precision, previous?.precision)}`,
    "",
    "📈 Numbers",
    `Hits: ${stats.hits}`,
    `Missed: ${stats.missed}`,
    `False positives: ${stats.falsePositives}`,
    `Official answers: ${stats.totalActual}`,
    `Predicted: ${stats.totalPredicted}`,
    "",
    "❌ Missed words",
    truncateList(stats.missedWords),
    "",
    "📖 Dictionary",
    `+${stats.dictionaryAdded} added / -${stats.dictionaryRemoved} removed`,
  ].join("\n");
}

async function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("⚠️ TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set, skipping send");
    return false;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API ${res.status}: ${body}`);
  }

  console.log("✅ Sent daily report to Telegram");
  return true;
}

async function main() {
  const actualWords = await readWordList("actual-words.txt");
  const predictedWords = await readWordList("predictions.txt");
  const dictionaryWords = await readWordList("words.txt");

  if (actualWords.length === 0) {
    console.log("⚠️ No actual words scraped, skipping stats");
    return;
  }

  const stats = computeStats(actualWords, predictedWords, dictionaryWords);
  const date = new Date().toISOString().slice(0, 10);

  const history = await loadHistory();
  const previous = history.filter((e) => e.date !== date).at(-1);

  const entry = {
    date,
    totalActual: stats.totalActual,
    totalPredicted: stats.totalPredicted,
    hits: stats.hits,
    missed: stats.missed,
    falsePositives: stats.falsePositives,
    recall: stats.recall,
    precision: stats.precision,
    dictionaryAdded: stats.dictionaryAdded,
    dictionaryRemoved: stats.dictionaryRemoved,
  };

  // Replace same-day entry so manual re-runs don't create duplicates
  const updated = history.filter((e) => e.date !== date).concat(entry);
  await saveHistory(updated);

  const message = buildMessage(date, stats, previous);
  console.log(message);

  try {
    await sendTelegram(message);
  } catch (error) {
    // A notification failure shouldn't fail the dictionary pipeline
    console.error("⚠️ Failed to send Telegram message:", error.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
