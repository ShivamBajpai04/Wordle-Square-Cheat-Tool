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

function extractGridFromPage() {
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

function setupInvalidWordWatcher() {
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
  }
}

async function showResults(response) {
  let resultsDiv = document.getElementById("solver-results");

  if (!resultsDiv) {
    resultsDiv = createUI();
    if (!resultsDiv) {
      return;
    }
  }

  // Fetch current state from storage
  const storage = await new Promise((resolve) => {
    chrome.storage.local.get(
      ["squaresSolverInvalidWords", "squaresSolverFoundWords"],
      (result) => {
        resolve(result);
      }
    );
  });

  // Initialize our sets with the data from storage
  notFoundWords = new Set(storage.squaresSolverInvalidWords || []);
  foundWords = new Set(storage.squaresSolverFoundWords || []);

  Logger.info(
    "Loaded from storage - Invalid words:",
    Array.from(notFoundWords)
  );
  Logger.info("Loaded from storage - Found words:", Array.from(foundWords));

  const words = response.words;
  if (!words || words.length === 0) {
    const container = document.getElementById("squares-solver-results");
    if (container) {
      container.remove();
    }
    return;
  }

  const wordsByLength = words.reduce((acc, word) => {
    const length = word.length;
    if (!acc[length]) {
      acc[length] = [];
    }
    acc[length].push(word);
    return acc;
  }, {});

  const sortedLengths = Object.keys(wordsByLength).sort((a, b) => a - b);

  resultsDiv.innerHTML = sortedLengths
    .map(
      (length) => `
      <div class="word-group">
        <div class="length-header">
          <hr />
          <span>Length: ${length}</span>
        </div>
        <div class="words-container">
          ${wordsByLength[length]
            .map((word) => {
              const wordLower = word.toLowerCase();
              const isInvalid = notFoundWords.has(wordLower);
              const isFound = foundWords.has(wordLower);
              const className = isInvalid
                ? "not-found"
                : isFound
                ? "found"
                : "";
              return `<span class="word-item ${className}" data-word="${wordLower}">${word}</span>`;
            })
            .join("")}
        </div>
      </div>
    `
    )
    .join("");

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
  };

  resultsDiv.updateWordStatus = updateWordStatus;
}

const Logger = {
  info: (...args) => console.log("[Squares Solver]:", ...args),
  error: (...args) => console.error("[Squares Solver Error]:", ...args),
  warn: (...args) => console.warn("[Squares Solver Warning]:", ...args),
};
