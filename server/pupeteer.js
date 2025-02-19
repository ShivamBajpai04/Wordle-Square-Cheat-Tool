import puppeteer from "puppeteer";

const CONFIG = {
  URL: "https://squares.org/",
  TIMEOUTS: {
    PAGE_LOAD: 30000,
    ELEMENT: 15000,
    ACTION: 10000,
  },
};

export const get_yesterdays_words = async () => {
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

    // Original skip tutorial logic with added safety
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
      console.log(error);
    }

    // Original popup close logic
    await page.waitForSelector(".absolute.right-4.top-4", {
      visible: true,
      timeout: CONFIG.TIMEOUTS.ELEMENT,
    });
    await page.click(".absolute.right-4.top-4");

    // Original iconbar interaction
    await page.waitForSelector(".iconbar__item", {
      visible: true,
      timeout: CONFIG.TIMEOUTS.ELEMENT,
    });
    await page.evaluate(() => {
      const items = document.querySelectorAll(".iconbar__item");
      if (items.length > 0) items[0].click();
    });

    // Original data extraction
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

    return yesterdayWords;
  } catch (error) {
    console.log(error);
  } finally {
    await browser.close();
  }
};
