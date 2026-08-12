import puppeteer from "puppeteer";

const CONFIG = {
  URL: "https://squares.org/",
  TIMEOUTS: {
    PAGE_LOAD: 30000,
    ELEMENT: 15000,
    ACTION: 10000,
  },
};

// Reports which known selectors the page actually has, so a scrape failure
// distinguishes "site markup changed" from "modal never opened"
async function logDomDiagnostics(page) {
  try {
    const seen = await page.evaluate(() => {
      const count = (sel) => document.querySelectorAll(sel).length;
      const panel = document.querySelector(".modal-panel");
      return {
        iconbarItems: count(".iconbar__item"),
        modalOpen: !!panel,
        modalTitle: panel?.querySelector("h3")?.textContent.trim() ?? null,
        wordpieceLabels: count(".micro-wordpiece__word__label"),
        panelButtons: panel ? panel.querySelectorAll("button").length : 0,
        url: location.href,
      };
    });
    console.log("DOM diagnostics:", JSON.stringify(seen));
  } catch (error) {
    console.log("Could not collect DOM diagnostics:", error.message);
  }
}

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

    // Close popup if needed. Best-effort: the popup doesn't always appear, so a
    // failure here must not stop us from opening the archive modal below.
    try {
      await page.waitForSelector(".absolute.right-4.top-4", {
        visible: true,
        timeout: CONFIG.TIMEOUTS.ACTION,
      });
      await page.click(".absolute.right-4.top-4");
      console.log("Closed popup");
    } catch (error) {
      console.log("Close popup error (continuing):", error.message);
    }

    // Open the archive modal, which holds both yesterday's grid and its answers
    try {
      await page.waitForSelector(".iconbar__item", {
        visible: true,
        timeout: CONFIG.TIMEOUTS.ELEMENT,
      });

      const opened = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll(".iconbar__item"));
        // The archive icon is the only one drawing calendar date ticks, so match
        // on that rather than a position that shifts when icons are reordered
        const archive =
          items.find((el) => el.querySelector('path[d="M16 3v4"]')) || items[0];
        if (!archive) return false;
        archive.click();
        return true;
      });

      if (!opened) throw new Error("No .iconbar__item found to click");
      console.log("Opened archive modal");
    } catch (error) {
      console.log("Archive modal error:", error.message);
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

    // Extract the answer list. Every word in the modal is a <button>, split
    // into a main list and a "Bonus Words" list further down the panel.
    try {
      await page.waitForFunction(
        () => {
          const panel = document.querySelector(".modal-panel");
          if (!panel) return false;
          return Array.from(panel.querySelectorAll("button")).some((b) =>
            /^[a-z]{3,}$/i.test(b.textContent.trim())
          );
        },
        { timeout: CONFIG.TIMEOUTS.ELEMENT }
      );

      const { mainWords, bonusWords } = await page.evaluate(() => {
        const panel = document.querySelector(".modal-panel");

        const bonusHeading = Array.from(panel.querySelectorAll("div")).find(
          (el) =>
            el.children.length === 0 &&
            el.textContent.trim().toLowerCase() === "bonus words"
        );

        const main = [];
        const bonus = [];

        for (const button of panel.querySelectorAll("button")) {
          const word = button.textContent.trim().toLowerCase();
          if (!/^[a-z]{3,}$/.test(word)) continue;

          const isBonus =
            bonusHeading &&
            bonusHeading.compareDocumentPosition(button) &
              Node.DOCUMENT_POSITION_FOLLOWING;

          (isBonus ? bonus : main).push(word);
        }

        return { mainWords: main, bonusWords: bonus };
      });

      // The game accepts bonus words too, so they belong in the dictionary.
      // Treating them as anything else would make the pruning step delete them.
      const yesterdayWords = [...new Set([...mainWords, ...bonusWords])];

      console.log(
        `Extracted ${mainWords.length} answers + ${bonusWords.length} bonus words`
      );

      if (yesterdayWords.length === 0) await logDomDiagnostics(page);

      return {
        yesterdayWords,
        mainWords,
        bonusWords,
        yesterdaysGrid,
      };
    } catch (error) {
      console.log("Yesterday's words extraction error:", error.message);
      await logDomDiagnostics(page);
      // Return whatever we have so far
      return {
        yesterdayWords: [],
        mainWords: [],
        bonusWords: [],
        yesterdaysGrid,
      };
    }
  } catch (error) {
    console.log("General error:", error.message);
    return {
      yesterdayWords: [],
      mainWords: [],
      bonusWords: [],
      yesterdaysGrid: null,
    };
  } finally {
    await browser.close();
  }
};