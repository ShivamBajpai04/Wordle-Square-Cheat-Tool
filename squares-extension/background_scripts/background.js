// Constants and configurations
const DEBUG = true; // Toggle for production

const CONFIG = {
  API_URL: "https://wordle-square-cheat-tool.onrender.com/solve",
  HEALTH_URL: "https://wordle-square-cheat-tool.onrender.com/health",
  MAX_RETRIES: 5,
  RETRY_DELAY: 3000,
  CACHE_KEY: "squaresSolverCache",
};

// Bump whenever the cached word format changes
const CACHE_VERSION = 2;

// Per-grid play state. The old global squaresSolverInvalidWords /
// squaresSolverFoundWords lists were never scoped or expired, so a word marked
// "not found" on one board was skipped forever on every later board, and a word
// could sit in both lists at once (the content script kept them exclusive, the
// stored copy did not). State is keyed by grid and dropped when the day rolls
// over, matching the solution cache.
const WORD_STATE_KEY = "squaresSolverWordState";
const LEGACY_KEYS = ["squaresSolverInvalidWords", "squaresSolverFoundWords"];

const emptyState = () => ({ found: [], invalid: [], timestamp: new Date().toISOString() });

async function readWordState(grid) {
  const store = await chrome.storage.local.get([WORD_STATE_KEY]);
  const all = store[WORD_STATE_KEY] || {};
  const entry = all[grid];
  if (!entry || !isValidCache(entry.timestamp)) return emptyState();
  return { found: entry.found || [], invalid: entry.invalid || [], timestamp: entry.timestamp };
}

// mutate receives Sets and is expected to keep them mutually exclusive.
async function writeWordState(grid, mutate) {
  const store = await chrome.storage.local.get([WORD_STATE_KEY]);
  const all = store[WORD_STATE_KEY] || {};

  // Drop yesterday's boards on the way past
  for (const key of Object.keys(all)) {
    if (!isValidCache(all[key]?.timestamp)) delete all[key];
  }

  const current = all[grid] && isValidCache(all[grid].timestamp) ? all[grid] : emptyState();
  const found = new Set(current.found || []);
  const invalid = new Set(current.invalid || []);

  mutate(found, invalid);

  const entry = {
    found: [...found],
    invalid: [...invalid],
    timestamp: new Date().toISOString(),
  };
  all[grid] = entry;
  await chrome.storage.local.set({ [WORD_STATE_KEY]: all });
  return entry;
}

function toWordArray(word) {
  return (Array.isArray(word) ? word : [word])
    .filter(Boolean)
    .map((w) => String(w).toLowerCase());
}

// Custom logger
const Logger = {
  info: (...args) => DEBUG && console.log("[Squares Solver]:", ...args),
  error: (...args) => console.error("[Squares Solver Error]:", ...args),
  warn: (...args) => console.warn("[Squares Solver Warning]:", ...args),
};

// Error handling
class SolverError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  Logger.info("Received message:", request.action);

  switch (request.action) {
    case "solve":
      handleSolveRequest(request, sendResponse);
      break;
    case "extractGrid":
      handleExtractGrid(sendResponse);
      break;
    case "triggerAutosolve":
      findSquaresTab().then((tab) => {
        if (tab) runAutosolve(tab.id);
      });
      sendResponse({ success: true });
      break;
    case "storeInvalidWord":
      handleStoreInvalidWord(request.grid, request.word);
      break;
    case "storeFoundWord":
      handleStoreFoundWord(request.grid, request.word);
      break;
    default:
      Logger.warn("Unknown action received:", request.action);
      sendResponse({ error: "Unknown action", success: false });
  }
  return true;
});

// The legacy global lists cannot be migrated: they have no grid to attach to,
// and carrying them forward is exactly the bug being fixed.
async function initializeStorage() {
  const storage = await chrome.storage.local.get(LEGACY_KEYS);
  const stale = LEGACY_KEYS.filter((key) => storage[key]);
  if (stale.length > 0) {
    Logger.info("Removing legacy un-scoped word lists:", stale);
    await chrome.storage.local.remove(stale);
  }
}

initializeStorage().catch((error) => {
  Logger.error("Error initializing storage:", error);
});

// ── Autosolve: driven entirely from background ──────────────

function isSquaresUrl(url) {
  return url && /^https?:\/\/(www\.)?squares\.org/i.test(url);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && isSquaresUrl(tab.url)) {
    Logger.info("Squares page loaded, checking autosolve...");
    runAutosolve(tabId);
  }
});

async function runAutosolve(tabId) {
  try {
    const storage = await chrome.storage.local.get([
      "autosolveEnabled",
      "autosolveDepth",
    ]);
    if (!storage.autosolveEnabled) return;

    const depth = storage.autosolveDepth || 10;
    Logger.info("Autosolve enabled, extracting grid from tab", tabId);

    const gridResult = await extractGridWithRetry(tabId, 15, 600);
    if (!gridResult?.grid) {
      Logger.warn("Autosolve: could not extract grid after retries");
      return;
    }

    Logger.info("Autosolve: grid found, solving...");
    const cachedResult = await getCachedResults(gridResult.grid);
    let words;

    if (cachedResult) {
      Logger.info("Autosolve: cache hit");
      words = cachedResult;
    } else {
      Logger.info("Autosolve: cache miss, fetching from API");
      await wakeUpServer();
      words = await retryOperation(() => fetchSolution(gridResult.grid, depth));
      await cacheResults(gridResult.grid, words);
    }

    if (!words || words.length === 0) {
      Logger.warn("Autosolve: no words found");
      return;
    }

    // Scoped to this board: a word the game rejected on another grid says
    // nothing about this one.
    const state = await readWordState(gridResult.grid);

    chrome.tabs.sendMessage(tabId, {
      action: "autoPlay",
      grid: gridResult.grid,
      words,
      invalidWords: state.invalid,
      foundWords: state.found,
    }).catch((err) => Logger.error("Autosolve: failed to send autoPlay:", err));

    Logger.info("Autosolve: sent", words.length, "words to tab for auto-play");
  } catch (error) {
    Logger.error("Autosolve failed:", error);
  }
}

async function extractGridWithRetry(tabId, maxAttempts, delayMs) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { action: "extractGrid" });
      if (result?.grid) return result;
    } catch {
      // Content script might not be ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

// Modify handleSolveRequest to ensure we're using storage data
async function handleSolveRequest(request, sendResponse) {
  try {
    if (!request.grid) {
      throw new SolverError("INVALID_INPUT", "Grid is required");
    }

    const state = await readWordState(request.grid);
    const invalidWords = state.invalid;
    const foundWords = state.found;

    Logger.info("Invalid words for this grid:", invalidWords);
    Logger.info("Found words for this grid:", foundWords);

    const cachedResult = await getCachedResults(request.grid);
    if (cachedResult) {
      Logger.info("Cache hit");
      sendResponse({
        grid: request.grid,
        words: cachedResult,
        invalidWords,
        foundWords,
        success: true,
      });
      return;
    }

    Logger.info("Cache miss, waking server and fetching from API");
    await wakeUpServer();
    const words = await retryOperation(() =>
      fetchSolution(request.grid, request.depth)
    );

    await cacheResults(request.grid, words);

    sendResponse({
      grid: request.grid,
      words,
      invalidWords,
      foundWords,
      success: true,
    });
  } catch (error) {
    Logger.error("Solve request failed:", error);
    sendResponse({
      error: error.message,
      errorCode: error.code,
      success: false,
    });
  }
}

async function findSquaresTab() {
  const active = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active[0]?.url?.includes("squares.org")) return active[0];

  const lastFocused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (lastFocused[0]?.url?.includes("squares.org")) return lastFocused[0];

  const byUrl = await chrome.tabs.query({ url: ["*://squares.org/*", "*://www.squares.org/*"] });
  if (byUrl[0]) return byUrl[0];

  return null;
}

function handleExtractGrid(sendResponse) {
  findSquaresTab().then((tab) => {
    if (!tab?.id) {
      Logger.error("No squares.org tab found");
      sendResponse({
        error: "Could not find a squares.org tab. Please make sure the game is open.",
        success: false,
      });
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { action: "extractGrid" },
      (response) => {
        if (chrome.runtime.lastError) {
          Logger.error("Tab messaging failed:", chrome.runtime.lastError.message);
          sendResponse({
            error: "Could not communicate with the page. Try refreshing squares.org.",
            success: false,
          });
          return;
        }
        sendResponse(response);
      }
    );
  });
}

// Cache operations with validation
async function getCachedResults(grid) {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG.CACHE_KEY], (result) => {
      try {
        const cache = result[CONFIG.CACHE_KEY] || {};
        const cachedData = cache[grid];

        if (!cachedData) {
          resolve(null);
          return;
        }

        if (!isValidCache(cachedData.timestamp)) {
          Logger.info("Cache expired for grid:", grid);
          deleteCacheEntry(grid);
          resolve(null);
          return;
        }

        // Entries written before path data existed are unusable for auto-play
        if (cachedData.version !== CACHE_VERSION) {
          Logger.info("Discarding stale-format cache entry for grid:", grid);
          deleteCacheEntry(grid);
          resolve(null);
          return;
        }

        resolve(cachedData.words);
      } catch (error) {
        Logger.error("Cache read error:", error);
        resolve(null);
      }
    });
  });
}

function isValidCache(timestamp) {
  const cacheDate = new Date(timestamp);
  const now = new Date();

  return (
    cacheDate.getFullYear() === now.getFullYear() &&
    cacheDate.getMonth() === now.getMonth() &&
    cacheDate.getDate() === now.getDate()
  );
}

async function deleteCacheEntry(grid) {
  chrome.storage.local.get([CONFIG.CACHE_KEY], (result) => {
    const cache = result[CONFIG.CACHE_KEY] || {};
    delete cache[grid];
    chrome.storage.local.set({ [CONFIG.CACHE_KEY]: cache });
  });
}

async function wakeUpServer() {
  try {
    await fetch(CONFIG.HEALTH_URL, { method: "GET" });
    Logger.info("Server is awake");
  } catch {
    Logger.warn("Server wake-up ping failed (may still be booting)");
  }
}

async function fetchSolution(grid, depth) {
  // Mini (9 cells) caps out at 9 and allows 3-letter words; classic (16) at 16.
  // Clamping here keeps the server from rejecting a depth carried over from the
  // other board size.
  const cells = grid.trim().split(/\s+/).length;
  const clamped = Math.min(Math.max(depth, cells === 9 ? 3 : 4), cells);

  const response = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ grid, depth: clamped }),
  });

  if (!response.ok) {
    throw new SolverError("API_ERROR", `Server error: ${response.status}`);
  }

  const data = await response.json();
  if (!data?.output) {
    throw new SolverError(
      "INVALID_RESPONSE",
      "Invalid response format from server"
    );
  }

  return data.output
    .split(" ")
    .filter((token) => token.length > 0)
    .map((token) => {
      const parts = token.split(":");
      if (parts.length === 3) {
        const [row, col] = parts[1].split(",").map(Number);
        return { word: parts[0], row, col, dirs: parts[2] };
      }
      return { word: parts[0], row: 0, col: 0, dirs: "" };
    });
}

async function retryOperation(operation) {
  let lastError;

  for (let i = 0; i < CONFIG.MAX_RETRIES; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const delay = CONFIG.RETRY_DELAY * Math.pow(2, i);
      Logger.warn(`Attempt ${i + 1}/${CONFIG.MAX_RETRIES} failed:`, error.message,
        i < CONFIG.MAX_RETRIES - 1 ? `retrying in ${delay}ms` : "giving up");

      if (i < CONFIG.MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Storage management
async function cacheResults(grid, words) {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG.CACHE_KEY], (result) => {
      const cache = result[CONFIG.CACHE_KEY] || {};

      // Update cache with new results
      cache[grid] = {
        words,
        version: CACHE_VERSION,
        timestamp: new Date().toISOString(),
      };

      // Clean up old entries
      cleanupCache(cache);

      chrome.storage.local.set({ [CONFIG.CACHE_KEY]: cache }, resolve);
    });
  });
}

function cleanupCache(cache) {
  Object.keys(cache).forEach((key) => {
    if (!isValidCache(cache[key].timestamp)) {
      delete cache[key];
    }
  });
}

// Storing a result for one board. The two sets are kept mutually exclusive:
// a word the game just accepted is no longer "not found", and vice versa.
async function broadcastWordState(grid, entry) {
  const tabs = await chrome.tabs.query({
    url: ["*://squares.org/*", "*://www.squares.org/*"],
  });
  tabs.forEach((tab) => {
    chrome.tabs
      .sendMessage(tab.id, {
        action: "updateWordState",
        grid,
        foundWords: entry.found,
        invalidWords: entry.invalid,
      })
      .catch(() => {});
  });
}

async function handleStoreInvalidWord(grid, word) {
  if (!grid) {
    Logger.warn("storeInvalidWord without a grid, ignoring:", word);
    return;
  }
  try {
    const entry = await writeWordState(grid, (found, invalid) => {
      for (const w of toWordArray(word)) {
        invalid.add(w);
        found.delete(w);
      }
    });
    await broadcastWordState(grid, entry);
  } catch (error) {
    Logger.error("Error storing invalid word:", error);
  }
}

async function handleStoreFoundWord(grid, word) {
  if (!grid) {
    Logger.warn("storeFoundWord without a grid, ignoring:", word);
    return;
  }
  try {
    const entry = await writeWordState(grid, (found, invalid) => {
      for (const w of toWordArray(word)) {
        found.add(w);
        invalid.delete(w);
      }
    });
    await broadcastWordState(grid, entry);
  } catch (error) {
    Logger.error("Error storing found word:", error);
  }
}
