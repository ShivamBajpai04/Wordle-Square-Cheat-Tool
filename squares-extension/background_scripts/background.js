chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "solve") {
    fetch("http://localhost:3000/solve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        grid: request.grid,
        depth: request.depth,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }
        return response.json();
      })
      .then((data) => {
        if (!data?.output) {
          throw new Error("Invalid response format from server");
        }
        sendResponse({ words: data.output, success: true });
      })
      .catch((error) => {
        console.error("API call error:", error);
        sendResponse({
          error: error.message,
          words: [],
          success: false,
        });
      });
    return true;
  }
});
