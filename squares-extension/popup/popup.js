document.addEventListener("DOMContentLoaded", () => {
  const solveBtn = document.getElementById("solve-btn");
  const clearBtn = document.getElementById("clear-btn");
  const solutionOutput = document.getElementById("solution-output");
  const depthInput = document.getElementById("depth-input");

  solveBtn.addEventListener("click", handleSolve);
  clearBtn.addEventListener("click", handleClear);

  function handleSolve() {
    const depth = parseInt(depthInput.value, 10);
    if (isNaN(depth) || depth < 4 || depth > 16) {
      showError("Please enter a depth between 4 and 16.");
      return;
    }

    // First extract the grid
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "extractGrid" },
        (gridResult) => {
          if (!gridResult || gridResult.error) {
            showError(gridResult?.error || "Failed to extract grid");
            return;
          }

          // Then solve with the extracted grid
          chrome.runtime.sendMessage(
            { action: "solve", grid: gridResult.grid, depth },
            handleSolveResponse
          );
        }
      );
    });
  }

  function handleSolveResponse(response) {
    if (!response || !response.success) {
      showError(response?.error || "Unknown error occurred");
      return;
    }

    // Make sure we have words to display
    if (!response.words || response.words.length === 0) {
      showError("No words found");
      return;
    }

    // Only send words to content script to display in injected UI
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "showResults",
        words: response.words,
      });
    });

    // Close the popup
    window.close();
  }

  function displayWords(words) {
    if (!Array.isArray(words)) {
      console.error("Expected words array, got:", words);
      return;
    }
    solutionOutput.innerHTML = words
      .map((word) => `<span class="word-box">${word}</span>`)
      .join(" ");
  }

  function showError(message) {
    console.error(message);
    solutionOutput.innerHTML = `<p class="error" style="color: red;">${message}</p>`;
  }

  function handleClear() {
    solutionOutput.innerHTML = "";
    // Also clear the injected UI if it exists
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "showResults", words: [] });
    });
  }
});
