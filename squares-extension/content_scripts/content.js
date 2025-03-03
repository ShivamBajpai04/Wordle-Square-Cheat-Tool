const DEBUG = false; // false - production, true - development

let notFoundWords = new Set();
let foundWords = new Set();
let lastAttemptedWord = "";

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

  const grid = Array.from(elements)
    .map((el) => {
      const attr = el.getAttribute("data-board");
      const parts = attr.split("-");
      if (parts.length >= 3) {
        const letter = parts[2];
        return letter.length === 1 ? letter.toLowerCase() : "";
      }
      return "";
    })
    .filter((letter) => letter !== "")
    .join(" ");

  if (!grid) {
    return {
      grid: null,
      error: "Could not extract letters from grid",
      foundWords: existingFoundWords,
      notFoundWords: existingInvalidWords,
    };
  }

  return {
    grid,
    error: null,
    foundWords: existingFoundWords,
    notFoundWords: existingInvalidWords,
  };
}

function createUI() {
  if (document.getElementById("squares-solver-results")) {
    return document.getElementById("solver-results");
  }

  const style = document.createElement("style");
  style.textContent = `
    #squares-solver-results {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 300px;
      height: 400px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 5px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      z-index: 10000;
      font-family: Arial, sans-serif;
      resize: both;
      overflow: hidden;
      min-width: 200px;
      min-height: 200px;
      max-width: 80vw;
      max-height: 80vh;
    }

    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
      cursor: move;
      user-select: none;
    }

    .results-title {
      font-weight: bold;
    }

    .close-button {
      background: none;
      border: none;
      color: #333;
      cursor: pointer;
      font-size: 20px;
      padding: 0 5px;
    }

    #solver-results {
      padding: 10px;
      height: calc(100% - 45px);
      overflow-y: auto;
    }

    .word-group {
      width: 100%;
      margin: 10px 0;
    }

    .length-header {
      text-align: center;
      position: relative;
      margin: 15px 0;
    }

    .length-header hr {
      border: none;
      border-top: 1px solid #ccc;
      margin: 0;
      position: absolute;
      top: 50%;
      width: 100%;
      z-index: 1;
    }

    .length-header span {
      background: white;
      padding: 0 10px;
      color: #666;
      font-size: 12px;
      position: relative;
      z-index: 2;
    }

    .words-container {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      justify-content: center;
    }

    .word-item {
      background-color: #f0f0f0;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 14px;
      display: inline-block;
    }

    .word-item.not-found {
      background-color: #ffebee;
      color: #d32f2f;
      border: 1px solid #ffcdd2;
    }

    .word-item.found {
      background-color: #e8f5e9;
      color: #2e7d32;
      border: 1px solid #a5d6a7;
    }
  `;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.id = "squares-solver-results";

  const header = document.createElement("div");
  header.className = "results-header";

  const title = document.createElement("span");
  title.className = "results-title";
  title.textContent = "Found Words";

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-button";
  closeBtn.innerHTML = "×";

  header.appendChild(title);
  header.appendChild(closeBtn);
  container.appendChild(header);

  const resultsDiv = document.createElement("div");
  resultsDiv.id = "solver-results";
  container.appendChild(resultsDiv);

  document.body.appendChild(container);

  let isDragging = false;
  let currentX;
  let currentY;
  let initialX;
  let initialY;

  header.addEventListener("mousedown", dragStart);
  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", dragEnd);

  function dragStart(e) {
    initialX = e.clientX - container.offsetLeft;
    initialY = e.clientY - container.offsetTop;
    if (e.target === header) {
      isDragging = true;
    }
  }

  function drag(e) {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      currentX = Math.min(
        Math.max(0, currentX),
        window.innerWidth - container.offsetWidth
      );
      currentY = Math.min(
        Math.max(0, currentY),
        window.innerHeight - container.offsetHeight
      );

      container.style.left = currentX + "px";
      container.style.top = currentY + "px";
      container.style.right = "auto";
      container.style.bottom = "auto";
    }
  }

  function dragEnd() {
    isDragging = false;
  }

  closeBtn.addEventListener("click", () => {
    container.remove();
    style.remove();
  });

  return resultsDiv;
}

// Add this function to periodically update the UI
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
  if (isInTutorial()) {
    return;
  }

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
            const isSuccess = node.style.backgroundColor === "rgb(85, 172, 73)";
            const isFailure = node.textContent
              .toLowerCase()
              .includes("word not found");

            if (lastAttemptedWord) {
              if (isSuccess) {
                Logger.info("Found successful word:", lastAttemptedWord);
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

  if (lastAttemptedWord) {
    notFoundWords.add(lastAttemptedWord);
    Logger.info("Added to notFoundWords set:", Array.from(notFoundWords));

    // Update the word in the UI
    const resultsDiv = document.getElementById("solver-results");
    if (resultsDiv && resultsDiv.updateWordStatus) {
      resultsDiv.updateWordStatus(lastAttemptedWord);
    }

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

    // Add all elements to the results div
    resultsDiv.appendChild(header);
    resultsDiv.appendChild(statsBar);
    resultsDiv.appendChild(searchBox);
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

  // Process and display the words
  const words = response.words || [];
  const invalidWords = response.invalidWords || [];

  // Update our sets
  if (invalidWords.length > 0) {
    invalidWords.forEach((word) => notFoundWords.add(word.toLowerCase()));
  }

  // Group words by length
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

  // Start auto-updating the UI
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
  error: (...args) =>
    DEBUG && console.error("[Squares Solver Error]:", ...args),
  warn: (...args) =>
    DEBUG && console.warn("[Squares Solver Warning]:", ...args),
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

// Call this function when the content script loads
injectStyles();
