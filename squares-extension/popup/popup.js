document.addEventListener("DOMContentLoaded", () => {
  const solveBtn = document.getElementById("solve-btn");
  const depthInput = document.getElementById("depth-input");
  const solutionOutput = document.getElementById("solution-output");
  const loadingElement = document.createElement("div");
  loadingElement.className = "loading";
  loadingElement.textContent = "Processing...";

  solveBtn.addEventListener("click", async () => {
    solutionOutput.innerHTML = "";
    solutionOutput.appendChild(loadingElement);

    const depth = parseInt(depthInput.value, 10);
    if (isNaN(depth) || depth < 4 || depth > 16) {
      solutionOutput.innerHTML =
        "<p class='error'>Please enter a depth between 3 and 17.</p>";
      return;
    }
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tabs[0]?.id) {
        throw new Error("No active tab found");
      }
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: "extractGrid" },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response);
          }
        );
      });
      if (!response?.grid) {
        throw new Error("No valid grid found on page");
      }
      const apiResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: "solve", grid: response.grid, depth },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(response);
          }
        );
      });

      if (apiResponse?.words?.length > 0) {
        const words = apiResponse.words.split(" ");
        renderWords(words);
      } else {
        solutionOutput.innerHTML = "<p>No words found.</p>";
      }
    } catch (error) {
      console.error("Error:", error);
      solutionOutput.innerHTML = `<p class='error'>Error: ${error.message}</p>`;
    }
  });

  function renderWords(words) {
    solutionOutput.innerHTML = "";
    const fragment = document.createDocumentFragment();

    const totalWords = document.createElement("div");
    totalWords.className = "total-words";
    totalWords.textContent = `Found ${words.length} words`;
    fragment.appendChild(totalWords);

    words.forEach((word) => {
      const wordBox = document.createElement("div");
      wordBox.className = "word-box";
      wordBox.textContent = word;
      fragment.appendChild(wordBox);
    });
    solutionOutput.appendChild(fragment);
  }
});
