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

// Add to the constants section
const INVALID_WORDS_KEY = "squaresSolverInvalidWords";
const FOUND_WORDS_KEY = "squaresSolverFoundWords";

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
      handleStoreInvalidWord(request.word);
      break;
    case "storeFoundWord":
      handleStoreFoundWord(request.word);
      break;
    default:
      Logger.warn("Unknown action received:", request.action);
      sendResponse({ error: "Unknown action", success: false });
  }
  return true;
});

// Add this function to initialize storage
async function initializeStorage() {
  const storage = await chrome.storage.local.get([
    INVALID_WORDS_KEY,
    FOUND_WORDS_KEY,
  ]);
  if (!storage[INVALID_WORDS_KEY]) {
    await chrome.storage.local.set({ [INVALID_WORDS_KEY]: [] });
  }
  if (!storage[FOUND_WORDS_KEY]) {
    await chrome.storage.local.set({ [FOUND_WORDS_KEY]: [] });
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
      "autosolveEnabled", "autosolveDepth",
      INVALID_WORDS_KEY, FOUND_WORDS_KEY,
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

    const invalidWords = storage[INVALID_WORDS_KEY] || [];
    const foundWords = storage[FOUND_WORDS_KEY] || [];

    chrome.tabs.sendMessage(tabId, {
      action: "autoPlay",
      words,
      invalidWords,
      foundWords,
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

    // Always get current storage state
    const storage = await chrome.storage.local.get([
      INVALID_WORDS_KEY,
      FOUND_WORDS_KEY,
    ]);
    const invalidWords = new Set(storage[INVALID_WORDS_KEY] || []);
    const foundWords = new Set(storage[FOUND_WORDS_KEY] || []);

    Logger.info("Current invalid words:", Array.from(invalidWords));
    Logger.info("Current found words:", Array.from(foundWords));

    const cachedResult = await getCachedResults(request.grid);
    if (cachedResult) {
      Logger.info("Cache hit");
      sendResponse({
        words: cachedResult,
        invalidWords: Array.from(invalidWords),
        foundWords: Array.from(foundWords),
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
      words,
      invalidWords: Array.from(invalidWords),
      foundWords: Array.from(foundWords),
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
  const response = await fetch(CONFIG.API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ grid, depth }),
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

// Add this function to handle storing invalid words
async function handleStoreInvalidWord(word) {
  try {
    const storage = await chrome.storage.local.get([INVALID_WORDS_KEY]);
    const invalidWords = new Set(storage[INVALID_WORDS_KEY] || []);

    // Handle both single words and arrays of words
    if (Array.isArray(word)) {
      word.forEach((w) => invalidWords.add(w));
    } else {
      invalidWords.add(word);
    }

    await chrome.storage.local.set({
      [INVALID_WORDS_KEY]: Array.from(invalidWords),
    });

    const tabs = await chrome.tabs.query({
      url: ["*://squares.org/*", "*://www.squares.org/*"],
    });
    tabs.forEach((tab) => {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "updateInvalidWords",
          invalidWords: Array.from(invalidWords),
        })
        .catch(() => {});
    });
  } catch (error) {
    Logger.error("Error storing invalid word:", error);
  }
}

// Add new function to handle storing found words
async function handleStoreFoundWord(word) {
  try {
    const storage = await chrome.storage.local.get([FOUND_WORDS_KEY]);
    const foundWords = new Set(storage[FOUND_WORDS_KEY] || []);

    // Handle both single words and arrays of words
    if (Array.isArray(word)) {
      word.forEach((w) => foundWords.add(w));
    } else {
      foundWords.add(word);
    }

    await chrome.storage.local.set({
      [FOUND_WORDS_KEY]: Array.from(foundWords),
    });

    const tabs = await chrome.tabs.query({
      url: ["*://squares.org/*", "*://www.squares.org/*"],
    });
    tabs.forEach((tab) => {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "updateFoundWords",
          foundWords: Array.from(foundWords),
        })
        .catch(() => {});
    });
  } catch (error) {
    Logger.error("Error storing found word:", error);
  }
}
