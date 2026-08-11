import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "./index.js";

let server;
const PORT = 0; // Let OS pick a free port

function request(path, options = {}) {
  const { method = "GET", body } = options;
  const url = `http://127.0.0.1:${server.address().port}${path}`;

  const fetchOpts = { method, headers: {} };
  if (body) {
    fetchOpts.headers["Content-Type"] = "application/json";
    fetchOpts.body = JSON.stringify(body);
  }
  return fetch(url, fetchOpts);
}

describe("Server", () => {
  before(
    () =>
      new Promise((resolve) => {
        server = app.listen(PORT, resolve);
      })
  );

  after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      })
  );

  // ── Health endpoint ──────────────────────────────────────────

  describe("GET /health", () => {
    it("returns 200 with healthy status", async () => {
      const res = await request("/health");
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.deepStrictEqual(data, { status: "healthy" });
    });
  });

  // ── Input validation ─────────────────────────────────────────

  describe("POST /solve - validation", () => {
    it("rejects missing grid", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { depth: 6 },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, "Missing required parameters");
    });

    it("rejects missing depth", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "a b c d e f g h i j k l m n o p" },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, "Missing required parameters");
    });

    it("rejects depth below 4", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "a b c d e f g h i j k l m n o p", depth: 2 },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, "Invalid depth");
    });

    it("rejects depth above 16", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "a b c d e f g h i j k l m n o p", depth: 20 },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, "Invalid depth");
    });

    it("rejects non-integer depth", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "a b c d e f g h i j k l m n o p", depth: 5.5 },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, "Invalid depth");
    });

    it("rejects grid with too few letters", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "a b c d e f g h", depth: 6 },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, "Invalid grid");
    });

    it("rejects grid with too many letters", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "a b c d e f g h i j k l m n o p q", depth: 6 },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, "Invalid grid");
    });

    it("rejects grid with non-letter characters", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "1 2 3 4 5 6 7 8 9 0 a b c d e f", depth: 6 },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, "Invalid grid");
    });

    it("rejects grid with multi-char tokens", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "ab c d e f g h i j k l m n o p q", depth: 6 },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, "Invalid grid");
    });
  });

  // ── Solver integration ───────────────────────────────────────

  describe("POST /solve - solver", () => {
    it("returns words for a valid grid", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "a b c d e f g h i j k l m n o p", depth: 6 },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(typeof data.output === "string");

      const words = data.output.split(" ").filter((w) => w.length > 0);
      assert.ok(words.length > 0, "Should find at least one word");
      words.forEach((word) => {
        assert.ok(
          word.length >= 4,
          `Word "${word}" should be at least 4 chars`
        );
        assert.ok(
          word.length <= 6,
          `Word "${word}" should not exceed depth 6`
        );
      });
    });

    it("respects depth limit", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "a b c d e f g h i j k l m n o p", depth: 4 },
      });
      assert.equal(res.status, 200);
      const data = await res.json();

      const words = data.output.split(" ").filter((w) => w.length > 0);
      words.forEach((word) => {
        assert.equal(
          word.length,
          4,
          `With depth 4, word "${word}" should be exactly 4 chars`
        );
      });
    });

    it("returns empty output for grid with no valid words", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "z z z z z z z z z z z z z z z z", depth: 4 },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.output, "");
    });

    it("accepts depth as string (coerced to number)", async () => {
      const res = await request("/solve", {
        method: "POST",
        body: { grid: "a b c d e f g h i j k l m n o p", depth: "6" },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(typeof data.output === "string");
    });
  });

  // ── Unknown routes ───────────────────────────────────────────

  describe("Unknown routes", () => {
    it("returns 404 for unknown GET routes", async () => {
      const res = await request("/nonexistent");
      assert.equal(res.status, 404);
    });
  });
});
