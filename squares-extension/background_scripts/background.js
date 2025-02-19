// Constants and configurations
const DEBUG = true; // Toggle for production

const CONFIG = {
  API_URL: "https://wordle-square-cheat-tool.onrender.com/solve",
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  CACHE_KEY: "squaresSolverCache",
};

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

// Call it when the extension starts
initializeStorage().catch((error) => {
  Logger.error("Error initializing storage:", error);
});

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

    Logger.info("Cache miss, fetching from API");
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

function handleExtractGrid(sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) {
      Logger.error("No active tab found");
      sendResponse({ error: "No active tab found", success: false });
      return;
    }

    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: "extractGrid" },
      sendResponse
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

// API interaction with retry mechanism
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

  return data.output.split(" ").filter((word) => word.length > 0);
}

async function retryOperation(operation) {
  let lastError;

  for (let i = 0; i < CONFIG.MAX_RETRIES; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      Logger.warn(`Attempt ${i + 1} failed:`, error.message);

      if (i < CONFIG.MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, CONFIG.RETRY_DELAY));
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

    // Notify all tabs to update their invalid words list
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "updateInvalidWords",
          invalidWords: Array.from(invalidWords),
        })
        .catch(() => {
          /* Ignore errors for inactive tabs */
        });
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

    // Notify all tabs to update their word lists
    const tabs = await chrome.tabs.query({});
    tabs.forEach((tab) => {
      chrome.tabs
        .sendMessage(tab.id, {
          action: "updateFoundWords",
          foundWords: Array.from(foundWords),
        })
        .catch(() => {
          /* Ignore errors for inactive tabs */
        });
    });
  } catch (error) {
    Logger.error("Error storing found word:", error);
  }
}
