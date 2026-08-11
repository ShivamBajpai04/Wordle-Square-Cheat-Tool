document.addEventListener("DOMContentLoaded", () => {
  const solveBtn = document.getElementById("solve-btn");
  const clearBtn = document.getElementById("clear-btn");
  const solutionOutput = document.getElementById("solution-output");
  const depthInput = document.getElementById("depth-input");
  const autosolveToggle = document.getElementById("autosolve-toggle");

  chrome.storage.local.get(["autosolveEnabled", "autosolveDepth"], (result) => {
    autosolveToggle.checked = !!result.autosolveEnabled;
    if (result.autosolveDepth) {
      depthInput.value = result.autosolveDepth;
    }
  });

  autosolveToggle.addEventListener("change", () => {
    const enabled = autosolveToggle.checked;
    chrome.storage.local.set({ autosolveEnabled: enabled });

    if (enabled) {
      chrome.runtime.sendMessage({ action: "triggerAutosolve" });
    }
  });

  depthInput.addEventListener("change", () => {
    const depth = parseInt(depthInput.value, 10);
    if (!isNaN(depth) && depth >= 4 && depth <= 16) {
      chrome.storage.local.set({ autosolveDepth: depth });
    }
  });

  solveBtn.addEventListener("click", handleSolve);
  clearBtn.addEventListener("click", handleClear);

  async function findSquaresTab() {
    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url?.includes("squares.org")) return tabs[0];

    tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs[0]?.url?.includes("squares.org")) return tabs[0];

    tabs = await chrome.tabs.query({
      url: ["*://squares.org/*", "*://www.squares.org/*"],
    });
    return tabs[0] || null;
  }

  async function handleSolve() {
    const depth = parseInt(depthInput.value, 10);
    if (isNaN(depth) || depth < 4 || depth > 16) {
      showError("Please enter a depth between 4 and 16.");
      return;
    }

    const tab = await findSquaresTab();
    if (!tab) {
      showError("No squares.org tab found. Please open the game first.");
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { action: "extractGrid" },
      (gridResult) => {
        if (chrome.runtime.lastError) {
          showError("Could not communicate with the page. Try refreshing squares.org.");
          return;
        }

        if (!gridResult || gridResult.error) {
          showError(gridResult?.error || "Failed to extract grid");
          return;
        }

        chrome.runtime.sendMessage(
          { action: "solve", grid: gridResult.grid, depth },
          handleSolveResponse
        );
      }
    );
  }

  async function handleSolveResponse(response) {
    if (!response || !response.success) {
      showError(response?.error || "Unknown error occurred");
      return;
    }

    if (!response.words || response.words.length === 0) {
      showError("No words found");
      return;
    }

    const tab = await findSquaresTab();
    if (tab) {
      chrome.tabs.sendMessage(tab.id, {
        action: "showResults",
        words: response.words,
        invalidWords: response.invalidWords || [],
        foundWords: response.foundWords || [],
      });
    }

    window.close();
  }

  function showError(message) {
    console.error(message);
    solutionOutput.innerHTML = `<p class="error" style="color: red;">${message}</p>`;
  }

  async function handleClear() {
    solutionOutput.innerHTML = "";
    const tab = await findSquaresTab();
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: "showResults", words: [] });
    }
  }
});
