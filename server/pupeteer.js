import puppeteer from "puppeteer";

const CONFIG = {
  URL: "https://squares.org/",
  TIMEOUTS: {
    PAGE_LOAD: 30000,
    ELEMENT: 15000,
    ACTION: 10000,
  },
};

export const get_game_data = async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  try {
    await page.goto(CONFIG.URL, {
      waitUntil: "domcontentloaded",
      timeout: CONFIG.TIMEOUTS.PAGE_LOAD,
    });

    // Skip tutorial if needed
    try {
      await page.waitForFunction(
        () => {
          const elements = Array.from(document.querySelectorAll("div"));
          return elements.some(
            (el) => el.textContent.trim() === "Skip tutorial"
          );
        },
        { timeout: CONFIG.TIMEOUTS.ELEMENT }
      );

      await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll("div"));
        const skipButton = elements.find(
          (el) => el.textContent.trim() === "Skip tutorial"
        );
        if (skipButton) skipButton.click();
      });
    } catch (error) {
      console.log("Skip tutorial error:", error.message);
    }

    // Close popup if needed
    try {
      await page.waitForSelector(".absolute.right-4.top-4", {
        visible: true,
        timeout: CONFIG.TIMEOUTS.ELEMENT,
      });
      await page.click(".absolute.right-4.top-4");
      //go to the answers modal
      await page.waitForSelector(".iconbar__item", {
        visible: true,
        timeout: CONFIG.TIMEOUTS.ELEMENT,
      });

      await page.evaluate(() => {
        const items = document.querySelectorAll(".iconbar__item");
        if (items.length > 0) items[0].click();
      });
    } catch (error) {
      console.log("Close popup error:", error.message);
    }
    // First extract today's grid
    let yesterdaysGrid = null;
    try {
      // Wait for the game board to load
      await page.waitForSelector(".micro-wordpiece__word__label", {
        visible: true,
        timeout: CONFIG.TIMEOUTS.ELEMENT,
      });

      // Extract the grid
      yesterdaysGrid = await page.evaluate(() => {
        const letters = Array.from(
          document.querySelectorAll(".micro-wordpiece__word__label")
        )
          .map((el) => el.textContent.trim().toLowerCase())
          .join(" ");
        return letters;
      });

      console.log("Extracted today's grid:", yesterdaysGrid);
    } catch (error) {
      console.log("Grid extraction error:", error.message);
    }

    // Now navigate to history tab for yesterday's words
    try {
      // Wait for yesterday's words to load
      await page.waitForSelector(".my__yesterday", {
        visible: true,
        timeout: CONFIG.TIMEOUTS.ELEMENT,
      });

      const yesterdayWords = await page.evaluate(() => {
        const lists = document.querySelectorAll(".my__yesterday");
        const words = [];
        lists.forEach((list) => {
          const listItems = list.querySelectorAll("li");
          listItems.forEach((li) => {
            words.push(li.textContent.trim());
          });
        });
        return words;
      });

      return {
        yesterdayWords,
        yesterdaysGrid,
      };
    } catch (error) {
      console.log("Yesterday's words extraction error:", error.message);
      // Return whatever we have so far
      return {
        yesterdayWords: [],
        yesterdaysGrid,
      };
    }
  } catch (error) {
    console.log("General error:", error.message);
    return {
      yesterdayWords: [],
      yesterdaysGrid: null,
    };
  } finally {
    await browser.close();
  }
};