chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractGrid") {
    try {
      const elements = document.querySelectorAll("[data-board]");

      if (!elements || elements.length === 0) {
        throw new Error("No board elements found");
      }

      const letters = Array.from(elements)
        .map((el) => {
          const parts = el.getAttribute("data-board")?.split("-");
          if (!parts || parts.length < 3) {
            throw new Error("Invalid board data format");
          }
          return parts[2];
        })
        .filter((letter) => letter && /^[a-z]$/.test(letter));

      if (letters.length === 0) {
        throw new Error("No valid letters found in grid");
      }

      const grid = letters.join(" ");
      sendResponse({ grid, success: true });
    } catch (error) {
      console.error("Grid extraction error:", error);
      sendResponse({ error: error.message, success: false });
    }

    return true; // Keep message channel open
  }
});
