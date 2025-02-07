// Handle grid extraction and UI injection
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractGrid") {
    Logger.info("Attempting to extract grid from page");
    const result = extractGridFromPage();

    if (result.error) {
      Logger.error("Grid extraction failed:", result.error);
    } else {
      Logger.info("Successfully extracted grid:", result.grid);
    }

    sendResponse(result);
  } else if (request.action === "showResults") {
    showResults(request.words);
    sendResponse({ success: true });
  }
  return true;
});

function extractGridFromPage() {
  // Find elements with data-board attribute
  const elements = document.querySelectorAll("[data-board]");

  if (!elements.length) {
    return { grid: null, error: "No grid elements found on page" };
  }

  // Extract letters from data-board attributes
  // Format is "*-*-x-*-*" where x is the letter
  const grid = Array.from(elements)
    .map((el) => {
      const attr = el.getAttribute("data-board");
      // Split by hyphen and get the third part (index 2)
      const parts = attr.split("-");
      if (parts.length >= 3) {
        const letter = parts[2];
        // Ensure it's a single letter
        return letter.length === 1 ? letter.toLowerCase() : "";
      }
      return "";
    })
    .filter((letter) => letter !== "") // Remove empty entries
    .join(" ");

  if (!grid) {
    Logger.error("Could not extract letters from data-board attributes");
    return { grid: null, error: "Could not extract letters from grid" };
  }

  Logger.info("Extracted grid:", grid);
  return { grid, error: null };
}

// Simplified UI for showing results
function createUI() {
  if (document.getElementById("squares-solver-results")) {
    return document.getElementById("solver-results");
  }

  // Create and inject styles
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

  // Make the window draggable
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
    style.remove(); // Clean up styles when closing
  });

  return resultsDiv;
}

function showResults(words) {
  let resultsDiv = document.getElementById("solver-results");

  // If no results div exists, create the UI
  if (!resultsDiv) {
    // Important: Store the returned div from createUI
    resultsDiv = createUI();
    if (!resultsDiv) {
      Logger.error("Failed to create UI");
      return;
    }
  }

  // If no words or empty array, remove the UI
  if (!words || words.length === 0) {
    const container = document.getElementById("squares-solver-results");
    if (container) {
      container.remove();
    }
    return;
  }

  Logger.info("Showing results:", words); // Add logging

  // Group words by length
  const wordsByLength = words.reduce((acc, word) => {
    const length = word.length;
    if (!acc[length]) {
      acc[length] = [];
    }
    acc[length].push(word);
    return acc;
  }, {});

  // Sort lengths in ascending order
  const sortedLengths = Object.keys(wordsByLength).sort((a, b) => a - b);

  // Create HTML for each length group
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
            .map((word) => `<span class="word-item">${word}</span>`)
            .join("")}
        </div>
      </div>
    `
    )
    .join("");
}

// Add Logger if it's not defined
const Logger = {
  info: (...args) => console.log("[Squares Solver]:", ...args),
  error: (...args) => console.error("[Squares Solver Error]:", ...args),
  warn: (...args) => console.warn("[Squares Solver Warning]:", ...args),
};
