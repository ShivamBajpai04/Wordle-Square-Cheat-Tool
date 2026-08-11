import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeStats, buildMessage } from "./scripts/daily-stats.mjs";

describe("Daily stats", () => {
  describe("computeStats", () => {
    it("counts hits, misses and false positives", () => {
      const actual = ["cent", "cere", "erne", "even"];
      const predicted = ["cent", "cere", "bogus", "junk"];
      const dictionary = ["cent", "cere", "bogus", "junk"];

      const stats = computeStats(actual, predicted, dictionary);

      assert.equal(stats.hits, 2);
      assert.equal(stats.missed, 2);
      assert.equal(stats.falsePositives, 2);
      assert.deepStrictEqual(stats.missedWords, ["erne", "even"]);
      assert.deepStrictEqual(stats.falsePositiveWords, ["bogus", "junk"]);
    });

    it("computes recall and precision as percentages", () => {
      const actual = ["a", "b", "c", "d"];
      const predicted = ["a", "b", "x"];

      const stats = computeStats(actual, predicted, []);

      // 2 of 4 official answers found
      assert.equal(stats.recall, 50);
      // 2 of 3 predictions correct
      assert.equal(stats.precision, 66.7);
    });

    it("reports perfect accuracy when prediction matches exactly", () => {
      const words = ["cent", "cere", "erne"];
      const stats = computeStats(words, words, []);

      assert.equal(stats.recall, 100);
      assert.equal(stats.precision, 100);
      assert.equal(stats.missed, 0);
      assert.equal(stats.falsePositives, 0);
    });

    it("returns null precision when nothing was predicted", () => {
      const stats = computeStats(["a", "b"], [], []);

      assert.equal(stats.precision, null);
      assert.equal(stats.recall, 0);
      assert.equal(stats.missed, 2);
    });

    it("counts dictionary additions for unseen actual words", () => {
      const actual = ["cent", "newword"];
      const predicted = ["cent"];
      const dictionary = ["cent", "oldjunk"];

      const stats = computeStats(actual, predicted, dictionary);

      assert.equal(stats.dictionaryAdded, 1);
    });

    it("only counts removals for false positives present in the dictionary", () => {
      const actual = ["cent"];
      const predicted = ["cent", "indict", "notindict"];
      const dictionary = ["cent", "indict"];

      const stats = computeStats(actual, predicted, dictionary);

      assert.equal(stats.falsePositives, 2);
      // "notindict" is a false positive but isn't in words.txt, so nothing to remove
      assert.equal(stats.dictionaryRemoved, 1);
    });

    it("deduplicates repeated words", () => {
      const stats = computeStats(["a", "a", "b"], ["a", "a"], []);

      assert.equal(stats.totalActual, 2);
      assert.equal(stats.totalPredicted, 1);
      assert.equal(stats.hits, 1);
    });
  });

  describe("buildMessage", () => {
    const stats = computeStats(["a", "b", "c", "d"], ["a", "b", "x"], []);

    it("includes the core metrics", () => {
      const msg = buildMessage("2026-08-12", stats, undefined);

      assert.match(msg, /Squares Solver — Daily Report/);
      assert.match(msg, /2026-08-12/);
      assert.match(msg, /Recall: 50%/);
      assert.match(msg, /Precision: 66\.7%/);
      assert.match(msg, /Hits: 2/);
      assert.match(msg, /Missed: 2/);
    });

    it("shows an upward trend against the previous day", () => {
      const msg = buildMessage("2026-08-12", stats, { recall: 40, precision: 60 });

      assert.match(msg, /Recall: 50% \(▲ 10%\)/);
      assert.match(msg, /Precision: 66\.7% \(▲ 6\.7%\)/);
    });

    it("shows a downward trend against the previous day", () => {
      const msg = buildMessage("2026-08-12", stats, { recall: 70, precision: 80 });

      assert.match(msg, /Recall: 50% \(▼ 20%\)/);
    });

    it("marks unchanged metrics explicitly", () => {
      const msg = buildMessage("2026-08-12", stats, { recall: 50, precision: 66.7 });

      assert.match(msg, /Recall: 50% \(no change\)/);
    });

    it("omits trend when there is no previous entry", () => {
      const msg = buildMessage("2026-08-12", stats, undefined);

      assert.doesNotMatch(msg, /▲|▼|no change/);
    });

    it("truncates a long missed-word list", () => {
      const many = Array.from({ length: 40 }, (_, i) => `word${i}`);
      const bigStats = computeStats(many, [], []);
      const msg = buildMessage("2026-08-12", bigStats, undefined);

      assert.match(msg, /… \+25 more/);
    });

    it("says 'none' when nothing was missed", () => {
      const perfect = computeStats(["a", "b"], ["a", "b"], []);
      const msg = buildMessage("2026-08-12", perfect, undefined);

      assert.match(msg, /❌ Missed words\nnone/);
    });
  });
});
