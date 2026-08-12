const DEBUG = false; // false - production, true - development

let notFoundWords = new Set();
let foundWords = new Set();
let lastAttemptedWord = "";
let watcherInitialized = false;
let autoPlayRunning = false;
let autoPlayAborted = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractGrid") {
    const result = extractGridFromPage();
    sendResponse(result);
  } else if (request.action === "showResults") {
    showResults({
      words: request.words,
      invalidWords: request.invalidWords,
      foundWords: request.foundWords,
    });
    setupInvalidWordWatcher();
    sendResponse({ success: true });
  } else if (request.action === "updateInvalidWords") {
    notFoundWords = new Set(request.invalidWords);
    const resultsDiv = document.getElementById("solver-results");
    if (resultsDiv && resultsDiv.updateWordStatus) {
      Array.from(notFoundWords).forEach((word) =>
        resultsDiv.updateWordStatus(word)
      );
    }
    sendResponse({ success: true });
  } else if (request.action === "updateFoundWords") {
    foundWords = new Set(request.foundWords);
    const resultsDiv = document.getElementById("solver-results");
    if (resultsDiv && resultsDiv.updateWordStatus) {
      Array.from(foundWords).forEach((word) =>
        resultsDiv.updateWordStatus(word)
      );
    }
    sendResponse({ success: true });
  } else if (request.action === "autoPlay") {
    showResults({
      words: request.words,
      invalidWords: request.invalidWords,
      foundWords: request.foundWords,
    });
    setupInvalidWordWatcher();
    startAutoPlay(request.words);
    sendResponse({ success: true });
  }
  return true;
});

function isInTutorial() {
  return window.location.pathname.includes("/tutorial");
}

function extractGridFromPage() {
  if (isInTutorial()) {
    return {
      grid: null,
      error: "Tutorial mode detected. Please complete the tutorial first.",
    };
  }

  const elements = document.querySelectorAll("[data-board]");

  // Extract already found words from the page
  const foundWordElements = document.querySelectorAll(".foundwords__element");
  const existingFoundWords = Array.from(foundWordElements).map((el) =>
    el.textContent.trim().toLowerCase()
  );

  // Extract invalid words from scorebubbles
  const invalidWordElements = document.querySelectorAll(".scorebubble__label");
  const existingInvalidWords = Array.from(invalidWordElements)
    .filter((el) => el.textContent.toLowerCase().includes("word not found"))
    .map((el) => {
      const inputElements = document.querySelectorAll(".gameinput__element");
      return Array.from(inputElements)
        .map((li) => li.textContent.trim().toLowerCase())
        .join("");
    })
    .filter((word) => word); // Filter out empty strings

  // Add to our sets and store them
  if (existingFoundWords.length > 0) {
    Logger.info("Found existing words on page:", existingFoundWords);
    existingFoundWords.forEach((word) => foundWords.add(word));

    chrome.runtime.sendMessage(
      {
        action: "storeFoundWord",
        word: existingFoundWords,
      },
      (response) => {
        Logger.info("Stored initial found words response:", response);
      }
    );
  }

  if (existingInvalidWords.length > 0) {
    Logger.info("Found existing invalid words on page:", existingInvalidWords);
    existingInvalidWords.forEach((word) => notFoundWords.add(word));

    chrome.runtime.sendMessage(
      {
        action: "storeInvalidWord",
        word: existingInvalidWords,
      },
      (response) => {
        Logger.info("Stored initial invalid words response:", response);
      }
    );
  }

  if (!elements.length) {
    return {
      grid: null,
      error: "No grid elements found on page",
      foundWords: existingFoundWords,
      notFoundWords: existingInvalidWords,
    };
  }

  // Order by the board coordinates in data-board, never by DOM order. The
  // solver returns paths as (row, col) and auto-play replays them through those
  // same coordinates, so both must describe the same frame. Reading DOM order
  // here silently rotates the board when the site changes its emission order,
  // which still yields a valid word list but drags every path wrong.
  const letters = getGridMatrix().flat();

  if (letters.length !== 16 || letters.some((letter) => !letter)) {
    return {
      grid: null,
      error: "Could not extract letters from grid",
      foundWords: existingFoundWords,
      notFoundWords: existingInvalidWords,
    };
  }

  const grid = letters.join(" ");

  return {
    grid,
    error: null,
    foundWords: existingFoundWords,
    notFoundWords: existingInvalidWords,
  };
}

// Periodically update the UI
function setupAutoUpdate() {
  if (isInTutorial()) {
    return;
  }

  // Check if we already have a results panel
  const resultsDiv = document.getElementById("squares-solver-results");
  if (!resultsDiv) {
    return; // No results panel to update
  }

  // Set up an interval to update the UI every 2 seconds
  const updateInterval = setInterval(() => {
    // Only update if the panel is visible
    if (resultsDiv.style.display !== "none") {
      updateResultsUI();
    }
  }, 2000);

  // Store the interval ID on the results div so we can clear it later if needed
  resultsDiv.updateInterval = updateInterval;
}

// Function to update the UI with current word statuses
function updateResultsUI() {
  const resultsDiv = document.getElementById("squares-solver-results");
  if (!resultsDiv) return;

  // Get all word items
  const wordItems = document.querySelectorAll(".word-item");

  wordItems.forEach((item) => {
    const word = item.getAttribute("data-word");

    // Update class based on current status
    item.classList.remove("found", "not-found");

    if (foundWords.has(word)) {
      item.classList.add("found");
    } else if (notFoundWords.has(word)) {
      item.classList.add("not-found");
    }
  });

  // Update stats
  const totalWordsCount = wordItems.length;
  const foundWordsCount = Array.from(wordItems).filter((item) =>
    item.classList.contains("found")
  ).length;
  const invalidWordsCount = Array.from(wordItems).filter((item) =>
    item.classList.contains("not-found")
  ).length;

  const totalElement = document.getElementById("total-words");
  const foundElement = document.getElementById("found-words-count");
  const invalidElement = document.getElementById("invalid-words-count");

  if (totalElement) totalElement.textContent = totalWordsCount;
  if (foundElement) foundElement.textContent = foundWordsCount;
  if (invalidElement) invalidElement.textContent = invalidWordsCount;
}

// Modify the setupInvalidWordWatcher function to call updateResultsUI
function setupInvalidWordWatcher() {
  if (isInTutorial() || watcherInitialized) {
    return;
  }
  watcherInitialized = true;

  Logger.info("Setting up invalid word watcher");

  // Watch for game input changes
  const gameInputObserver = new MutationObserver((mutations) => {
    const letters = Array.from(document.querySelectorAll(".gameinput__element"))
      .map((li) => li.textContent.trim().toLowerCase())
      .join("");

    if (letters) {
      lastAttemptedWord = letters;
      Logger.info("Updated last attempted word:", lastAttemptedWord);
    }
  });

  // Observe the game input container
  const gameInput = document.querySelector(".gameinput");
  if (gameInput) {
    gameInputObserver.observe(gameInput, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    Logger.info("Observing game input");
  }

  // Watch for score bubble labels
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.classList?.contains("scorebubble__label")
        ) {
          const scoreBubble = node.closest(".scorebubble");

          if (scoreBubble) {
            const text = node.textContent.toLowerCase();
            const isFailure = text.includes("word not found");
            const isAlreadyFound = text.includes("already found");
            const computedBg = window.getComputedStyle(node).backgroundColor;
            const isGreenBg = computedBg.match(
              /rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)/
            );
            const isSuccess =
              !isFailure &&
              !isAlreadyFound &&
              (text.match(/^\+?\d+$/) ||
                (isGreenBg &&
                  Number(isGreenBg[1]) < 150 &&
                  Number(isGreenBg[2]) > 100 &&
                  Number(isGreenBg[3]) < 150));

            if (lastAttemptedWord) {
              // "already found" confirms the word is valid and on the board,
              // so it counts the same as a fresh success
              if (isSuccess || isAlreadyFound) {
                Logger.info(
                  isAlreadyFound ? "Word already found:" : "Found successful word:",
                  lastAttemptedWord
                );
                foundWords.add(lastAttemptedWord);
                notFoundWords.delete(lastAttemptedWord);

                chrome.runtime.sendMessage(
                  {
                    action: "storeFoundWord",
                    word: lastAttemptedWord,
                  },
                  (response) => {
                    Logger.info("Stored found word response:", response);
                  }
                );

                // Update UI immediately
                updateResultsUI();
              } else if (isFailure) {
                Logger.info("Found invalid word:", lastAttemptedWord);
                notFoundWords.add(lastAttemptedWord);
                foundWords.delete(lastAttemptedWord);

                chrome.runtime.sendMessage(
                  {
                    action: "storeInvalidWord",
                    word: lastAttemptedWord,
                  },
                  (response) => {
                    Logger.info("Stored invalid word response:", response);
                  }
                );

                // Update UI immediately
                updateResultsUI();
              }

              // Update UI
              const resultsDiv = document.getElementById("solver-results");
              if (resultsDiv && resultsDiv.updateWordStatus) {
                resultsDiv.updateWordStatus(lastAttemptedWord);
              }
            }
          }
        }
      });
    });
  });

  // Find all scorebubble elements to observe
  const scoreBubbles = document.querySelectorAll(".scorebubble");
  Logger.info("Found existing scorebubbles:", scoreBubbles.length);

  scoreBubbles.forEach((bubble) => {
    observer.observe(bubble, {
      childList: true,
      subtree: false,
    });
    Logger.info("Observing scorebubble:", bubble);
  });

  // Also observe the document body for new scorebubbles
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
  });
  Logger.info("Observing document body for new scorebubbles");

  // Start auto-updating the UI
  setupAutoUpdate();
}

// Modify the showResults function to include a call to setupAutoUpdate
function showResults(response) {
  if (isInTutorial()) {
    console.log("Tutorial mode detected. Not showing results.");
    return;
  }

  let resultsDiv = document.getElementById("squares-solver-results");

  // Create the results panel if it doesn't exist
  if (!resultsDiv) {
    resultsDiv = document.createElement("div");
    resultsDiv.id = "squares-solver-results";
    resultsDiv.className = "squares-solver-panel";

    // Create header with title and close button
    const header = document.createElement("div");
    header.className = "results-header";

    const title = document.createElement("div");
    title.className = "results-title";
    title.textContent = "Squares Solver";

    const closeButton = document.createElement("button");
    closeButton.className = "close-button";
    closeButton.innerHTML = "×";
    closeButton.addEventListener("click", () => {
      resultsDiv.style.display = "none";
    });

    // Create minimize button
    const minimizeButton = document.createElement("button");
    minimizeButton.className = "minimize-button";
    minimizeButton.innerHTML = "−";
    minimizeButton.addEventListener("click", () => {
      const content = document.getElementById("solver-results");
      if (content.style.display === "none") {
        content.style.display = "flex";
        minimizeButton.innerHTML = "−";
        resultsDiv.classList.remove("minimized");
      } else {
        content.style.display = "none";
        minimizeButton.innerHTML = "+";
        resultsDiv.classList.add("minimized");
      }
    });

    // Add buttons to header
    header.appendChild(title);
    header.appendChild(minimizeButton);
    header.appendChild(closeButton);

    // Create content div
    const content = document.createElement("div");
    content.id = "solver-results";

    // Create stats bar
    const statsBar = document.createElement("div");
    statsBar.className = "stats-bar";

    const totalWords = document.createElement("div");
    totalWords.className = "stat-item";
    totalWords.innerHTML =
      "<span class='stat-label'>Total:</span> <span class='stat-value' id='total-words'>0</span>";

    const foundWordsCount = document.createElement("div");
    foundWordsCount.className = "stat-item";
    foundWordsCount.innerHTML =
      "<span class='stat-label'>Found:</span> <span class='stat-value' id='found-words-count'>0</span>";

    const invalidWordsCount = document.createElement("div");
    invalidWordsCount.className = "stat-item";
    invalidWordsCount.innerHTML =
      "<span class='stat-label'>Invalid:</span> <span class='stat-value' id='invalid-words-count'>0</span>";

    statsBar.appendChild(totalWords);
    statsBar.appendChild(foundWordsCount);
    statsBar.appendChild(invalidWordsCount);

    // Create search box
    const searchBox = document.createElement("div");
    searchBox.className = "search-box";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search words...";
    searchInput.className = "search-input";
    searchInput.addEventListener("input", (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const wordItems = document.querySelectorAll(".word-item");

      wordItems.forEach((item) => {
        const word = item.getAttribute("data-word");
        const wordGroup = item.closest(".word-group");

        if (word.includes(searchTerm)) {
          item.style.display = "inline-block";
          if (wordGroup) wordGroup.style.display = "block";
        } else {
          item.style.display = "none";
        }
      });

      // Hide empty groups
      document.querySelectorAll(".word-group").forEach((group) => {
        const visibleWords = group.querySelectorAll(
          ".word-item[style='display: inline-block']"
        ).length;
        if (visibleWords === 0) {
          group.style.display = "none";
        }
      });

      // Show all groups if search is empty
      if (searchTerm === "") {
        document.querySelectorAll(".word-group").forEach((group) => {
          group.style.display = "block";
        });
        wordItems.forEach((item) => {
          item.style.display = "inline-block";
        });
      }
    });

    searchBox.appendChild(searchInput);

    const autoPlayBar = document.createElement("div");
    autoPlayBar.className = "autoplay-bar";

    const autoPlayBtn = document.createElement("button");
    autoPlayBtn.id = "autoplay-btn";
    autoPlayBtn.className = "autoplay-btn";
    autoPlayBtn.textContent = "Auto Play";

    const stopBtn = document.createElement("button");
    stopBtn.id = "autoplay-stop-btn";
    stopBtn.className = "autoplay-btn stop-btn";
    stopBtn.textContent = "Stop";
    stopBtn.style.display = "none";

    const statusText = document.createElement("span");
    statusText.id = "autoplay-status";
    statusText.className = "autoplay-status";

    autoPlayBar.appendChild(autoPlayBtn);
    autoPlayBar.appendChild(stopBtn);
    autoPlayBar.appendChild(statusText);

    resultsDiv.appendChild(header);
    resultsDiv.appendChild(statsBar);
    resultsDiv.appendChild(searchBox);
    resultsDiv.appendChild(autoPlayBar);
    resultsDiv.appendChild(content);

    // Make the panel draggable
    header.addEventListener("mousedown", initDrag);

    document.body.appendChild(resultsDiv);
  } else {
    // If panel exists, just show it
    resultsDiv.style.display = "block";
    document.getElementById("solver-results").style.display = "flex";
    resultsDiv.classList.remove("minimized");
    document.querySelector(".minimize-button").innerHTML = "−";
  }

  const rawWords = response.words || [];
  const invalidWords = response.invalidWords || [];
  const responseFoundWords = response.foundWords || [];

  if (invalidWords.length > 0) {
    invalidWords.forEach((word) => notFoundWords.add(word.toLowerCase()));
  }
  if (responseFoundWords.length > 0) {
    responseFoundWords.forEach((word) => foundWords.add(word.toLowerCase()));
  }

  const words = rawWords.map((w) => (typeof w === "string" ? w : w.word));

  const wordsByLength = {};
  words.forEach((word) => {
    const length = word.length;
    if (!wordsByLength[length]) {
      wordsByLength[length] = [];
    }
    wordsByLength[length].push(word);
  });

  // Sort lengths and words within each length
  const sortedLengths = Object.keys(wordsByLength).sort((a, b) => a - b);
  sortedLengths.forEach((length) => {
    wordsByLength[length].sort();
  });

  // Generate HTML for the words
  const content = document.getElementById("solver-results");
  content.innerHTML = "";

  sortedLengths.forEach((length) => {
    const wordGroup = document.createElement("div");
    wordGroup.className = "word-group";

    const lengthHeader = document.createElement("div");
    lengthHeader.className = "length-header";

    const hr = document.createElement("hr");
    const lengthLabel = document.createElement("span");
    lengthLabel.textContent = `Length: ${length}`;

    lengthHeader.appendChild(hr);
    lengthHeader.appendChild(lengthLabel);

    const wordsContainer = document.createElement("div");
    wordsContainer.className = "words-container";

    wordsByLength[length].forEach((word) => {
      const wordLower = word.toLowerCase();
      const wordItem = document.createElement("span");
      wordItem.className = "word-item";
      wordItem.setAttribute("data-word", wordLower);
      wordItem.textContent = word;

      // Add appropriate class based on word status
      if (notFoundWords.has(wordLower)) {
        wordItem.classList.add("not-found");
      } else if (foundWords.has(wordLower)) {
        wordItem.classList.add("found");
      }

      // Add click handler to copy word to clipboard
      wordItem.addEventListener("click", () => {
        navigator.clipboard.writeText(word).then(() => {
          wordItem.classList.add("copied");
          setTimeout(() => {
            wordItem.classList.remove("copied");
          }, 1000);
        });
      });

      wordsContainer.appendChild(wordItem);
    });

    wordGroup.appendChild(lengthHeader);
    wordGroup.appendChild(wordsContainer);
    content.appendChild(wordGroup);
  });

  // Update stats
  const totalWordsCount = words.length;
  const foundWordsCount = Array.from(foundWords).filter((word) =>
    words.map((w) => w.toLowerCase()).includes(word)
  ).length;
  const invalidWordsCount = Array.from(notFoundWords).filter((word) =>
    words.map((w) => w.toLowerCase()).includes(word)
  ).length;

  document.getElementById("total-words").textContent = totalWordsCount;
  document.getElementById("found-words-count").textContent = foundWordsCount;
  document.getElementById("invalid-words-count").textContent =
    invalidWordsCount;

  // Add the updateWordStatus function to the results div
  const updateWordStatus = (word) => {
    const wordElements = document.querySelectorAll(
      `.word-item[data-word="${word}"]`
    );
    wordElements.forEach((element) => {
      element.classList.remove("not-found", "found");
      if (notFoundWords.has(word)) {
        element.classList.add("not-found");
      } else if (foundWords.has(word)) {
        element.classList.add("found");
      }
    });

    // Update stats
    const totalWordsCount = words.length;
    const foundWordsCount = Array.from(foundWords).filter((word) =>
      words.map((w) => w.toLowerCase()).includes(word)
    ).length;
    const invalidWordsCount = Array.from(notFoundWords).filter((word) =>
      words.map((w) => w.toLowerCase()).includes(word)
    ).length;

    document.getElementById("total-words").textContent = totalWordsCount;
    document.getElementById("found-words-count").textContent = foundWordsCount;
    document.getElementById("invalid-words-count").textContent =
      invalidWordsCount;
  };

  resultsDiv.updateWordStatus = updateWordStatus;
  resultsDiv._wordInfos = rawWords;

  const autoPlayBtn = document.getElementById("autoplay-btn");
  const stopBtn = document.getElementById("autoplay-stop-btn");
  if (autoPlayBtn) {
    autoPlayBtn.onclick = () => {
      if (autoPlayRunning) return;
      autoPlayBtn.style.display = "none";
      stopBtn.style.display = "inline-block";
      startAutoPlay(resultsDiv._wordInfos).then(() => {
        autoPlayBtn.style.display = "inline-block";
        stopBtn.style.display = "none";
      });
    };
  }
  if (stopBtn) {
    stopBtn.onclick = () => {
      autoPlayAborted = true;
    };
  }

  setupAutoUpdate();
}

// Draggable functionality
function initDrag(e) {
  const resultsDiv = document.getElementById("squares-solver-results");
  let offsetX = e.clientX - resultsDiv.getBoundingClientRect().left;
  let offsetY = e.clientY - resultsDiv.getBoundingClientRect().top;

  document.addEventListener("mousemove", movePanel);
  document.addEventListener("mouseup", stopDrag);

  function movePanel(e) {
    resultsDiv.style.left = e.clientX - offsetX + "px";
    resultsDiv.style.top = e.clientY - offsetY + "px";
  }

  function stopDrag() {
    document.removeEventListener("mousemove", movePanel);
    document.removeEventListener("mouseup", stopDrag);
  }
}

const Logger = {
  info: (...args) => DEBUG && console.log("[Squares Solver]:", ...args),
  error: (...args) => console.error("[Squares Solver Error]:", ...args),
  warn: (...args) => console.warn("[Squares Solver Warning]:", ...args),
};

// Add this function to inject the CSS styles
function injectStyles() {
  const styleElement = document.createElement("style");
  styleElement.textContent = `
    /* Results panel styling */
    #squares-solver-results {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 300px;
      height: 400px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
      z-index: 10000;
      font-family: Arial, sans-serif;
      resize: both;
      overflow: hidden;
      min-width: 200px;
      min-height: 200px;
      max-width: 80vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      transition: all 0.3s ease;
    }

    #squares-solver-results.minimized {
      height: 40px !important;
      resize: none;
    }

    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 15px;
      background: #4a6fa5;
      color: white;
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;
      cursor: move;
      user-select: none;
    }

    .results-title {
      font-weight: bold;
      font-size: 16px;
    }

    .close-button, .minimize-button {
      background: none;
      border: none;
      color: white;
      cursor: pointer;
      font-size: 20px;
      padding: 0 5px;
      transition: color 0.2s;
    }

    .close-button:hover, .minimize-button:hover {
      color: #ff9999;
    }

    .stats-bar {
      display: flex;
      justify-content: space-around;
      padding: 8px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
    }

    .stat-item {
      text-align: center;
    }

    .stat-label {
      font-size: 12px;
      color: #666;
    }

    .stat-value {
      font-weight: bold;
      color: #333;
    }

    .search-box {
      padding: 8px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
    }

    .search-input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
    }

    #solver-results {
      padding: 10px;
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .word-group {
      margin-bottom: 10px;
    }

    .length-header {
      display: flex;
      align-items: center;
      margin: 5px 0;
    }

    .length-header hr {
      flex: 1;
      border: none;
      height: 1px;
      background: #ddd;
      margin-right: 10px;
    }

    .length-header span {
      font-size: 14px;
      color: #666;
      white-space: nowrap;
    }

    .words-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .word-item {
      display: inline-block;
      padding: 4px 8px;
      background: #f0f0f0;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .word-item:hover {
      background: #e0e0e0;
      transform: translateY(-2px);
    }

    .word-item.found {
      background: #c8e6c9;
      color: #2e7d32;
    }

    .word-item.not-found {
      background: #ffcdd2;
      color: #c62828;
      text-decoration: line-through;
    }

    .word-item.copied {
      background: #bbdefb;
      color: #1565c0;
    }

    .word-item.auto-playing {
      background: #fff3e0;
      color: #e65100;
      outline: 2px solid #ff9800;
    }

    .autoplay-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: #eef;
      border-bottom: 1px solid #ddd;
    }

    .autoplay-btn {
      padding: 4px 12px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      font-weight: bold;
      color: white;
      background: #4a6fa5;
    }

    .autoplay-btn:hover {
      background: #3a5f95;
    }

    .autoplay-btn.stop-btn {
      background: #d32f2f;
    }

    .autoplay-btn.stop-btn:hover {
      background: #b71c1c;
    }

    .autoplay-status {
      font-size: 12px;
      color: #555;
    }

    /* Scrollbar styling */
    #solver-results::-webkit-scrollbar {
      width: 8px;
    }

    #solver-results::-webkit-scrollbar-track {
      background: #f1f1f1;
    }

    #solver-results::-webkit-scrollbar-thumb {
      background: #ccc;
      border-radius: 4px;
    }

    #solver-results::-webkit-scrollbar-thumb:hover {
      background: #aaa;
    }
  `;
  document.head.appendChild(styleElement);
}

// ── Auto-play engine ────────────────────────────────────────

const DIR_MAP = {
  D: [1, 0], U: [-1, 0], R: [0, 1], L: [0, -1],
  "1": [1, 1], "2": [-1, -1], "3": [1, -1], "4": [-1, 1],
};

function getGridElements() {
  const map = {};
  document.querySelectorAll("[data-board]").forEach((el) => {
    const parts = el.getAttribute("data-board").split("-");
    if (parts.length >= 3) {
      map[`${parts[0]},${parts[1]}`] = el;
    }
  });
  return map;
}

function getGridMatrix() {
  const grid = [
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ];
  document.querySelectorAll("[data-board]").forEach((el) => {
    const [r, c, letter] = el.getAttribute("data-board").split("-");
    const row = Number(r);
    const col = Number(c);
    if (grid[row] && letter && letter.length === 1) {
      grid[row][col] = letter.toLowerCase();
    }
  });
  return grid;
}

// Used only when the solver response predates path output, so the word list
// arrives without direction strings.
function computeDirs(grid, word) {
  const labels = Object.entries(DIR_MAP);
  const seen = Array.from({ length: 4 }, () => Array(4).fill(false));

  function walk(r, c, index, dirs) {
    if (r < 0 || r > 3 || c < 0 || c > 3) return null;
    if (seen[r][c] || grid[r][c] !== word[index]) return null;
    if (index === word.length - 1) return dirs;

    seen[r][c] = true;
    for (const [label, [dr, dc]] of labels) {
      const result = walk(r + dr, c + dc, index + 1, dirs + label);
      if (result !== null) {
        seen[r][c] = false;
        return result;
      }
    }
    seen[r][c] = false;
    return null;
  }

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const dirs = walk(r, c, 0, "");
      if (dirs !== null) return { word, row: r, col: c, dirs };
    }
  }
  return null;
}

function normalizeWordInfos(rawWords) {
  const needsFallback = [];
  const normalized = rawWords.map((entry) => {
    const info =
      typeof entry === "string"
        ? { word: entry, row: 0, col: 0, dirs: "" }
        : { ...entry };
    // A single-letter word needs no directions, everything else does
    if (!info.dirs && info.word.length > 1) needsFallback.push(info);
    return info;
  });

  if (needsFallback.length > 0) {
    Logger.warn(
      `${needsFallback.length} words arrived without path data; computing locally`
    );
    const grid = getGridMatrix();
    needsFallback.forEach((info) => {
      const resolved = computeDirs(grid, info.word.toLowerCase());
      if (resolved) {
        info.row = resolved.row;
        info.col = resolved.col;
        info.dirs = resolved.dirs;
      }
    });
  }

  return normalized;
}

function pathFromDirs(row, col, dirs) {
  const cells = [[row, col]];
  let r = row, c = col;
  for (const ch of dirs) {
    const d = DIR_MAP[ch];
    if (!d) continue;
    r += d[0];
    c += d[1];
    cells.push([r, c]);
  }
  return cells;
}

function firePointer(target, type, x, y) {
  const opts = {
    bubbles: true, cancelable: true, view: window,
    clientX: x, clientY: y, pointerId: 1,
    pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1,
  };
  target.dispatchEvent(new PointerEvent(type, opts));
  const mouseType = type.replace("pointer", "mouse");
  target.dispatchEvent(new MouseEvent(mouseType, opts));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function simulateWordDrag(wordInfo, gridEls) {
  const cells = pathFromDirs(wordInfo.row, wordInfo.col, wordInfo.dirs);

  const firstEl = gridEls[`${cells[0][0]},${cells[0][1]}`];
  if (!firstEl) return false;
  const firstRect = firstEl.getBoundingClientRect();
  firePointer(firstEl, "pointerdown", firstRect.left + firstRect.width / 2, firstRect.top + firstRect.height / 2);

  await sleep(40);

  for (let i = 1; i < cells.length; i++) {
    const el = gridEls[`${cells[i][0]},${cells[i][1]}`];
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    firePointer(el, "pointermove", x, y);
    await sleep(40);
  }

  const lastEl = gridEls[`${cells[cells.length - 1][0]},${cells[cells.length - 1][1]}`];
  const lastRect = lastEl.getBoundingClientRect();
  firePointer(lastEl, "pointerup", lastRect.left + lastRect.width / 2, lastRect.top + lastRect.height / 2);

  return true;
}

async function startAutoPlay(wordInfos) {
  if (autoPlayRunning) return;
  autoPlayRunning = true;
  autoPlayAborted = false;

  const gridEls = getGridElements();
  if (Object.keys(gridEls).length === 0) {
    Logger.error("Auto-play: no grid elements found on the page");
    updateAutoPlayStatus("No game grid found");
    autoPlayRunning = false;
    return;
  }

  const normalized = normalizeWordInfos(wordInfos || []);
  const unplayed = normalized.filter(
    (w) =>
      !foundWords.has(w.word.toLowerCase()) &&
      !notFoundWords.has(w.word.toLowerCase())
  );
  const playable = unplayed.filter((w) => w.dirs);

  if (playable.length === 0) {
    const reason =
      normalized.length === 0
        ? "No words to play"
        : unplayed.length === 0
        ? "All words already tried"
        : "No path data for these words";
    Logger.warn(
      `Auto-play: nothing to play (${reason}). total=${normalized.length}, untried=${unplayed.length}`
    );
    updateAutoPlayStatus(reason);
    autoPlayRunning = false;
    setTimeout(() => updateAutoPlayStatus(null), 4000);
    return;
  }

  updateAutoPlayStatus(`Playing 0/${playable.length}...`);

  for (let i = 0; i < playable.length; i++) {
    if (autoPlayAborted) break;

    const w = playable[i];
    updateAutoPlayStatus(`Playing ${i + 1}/${playable.length}: ${w.word}`);
    highlightCurrentWord(w.word.toLowerCase());

    await simulateWordDrag(w, gridEls);
    await sleep(900);
  }

  autoPlayRunning = false;
  updateAutoPlayStatus(autoPlayAborted ? "Stopped" : "Done!");
  setTimeout(() => updateAutoPlayStatus(null), 3000);
}

function highlightCurrentWord(word) {
  document.querySelectorAll(".word-item.auto-playing").forEach((el) =>
    el.classList.remove("auto-playing")
  );
  const el = document.querySelector(`.word-item[data-word="${word}"]`);
  if (el) {
    el.classList.add("auto-playing");
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function updateAutoPlayStatus(text) {
  const el = document.getElementById("autoplay-status");
  if (!el) return;
  el.textContent = text || "";
  el.style.display = text ? "block" : "none";
}

injectStyles();
