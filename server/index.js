import express from "express";
import { spawn } from "child_process";
import path from "path";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import morgan from "morgan";

// Load environment variables
dotenv.config();

const app = express();

app.use(
  morgan("dev", {
    skip: (req, res) => req.path === "/health",
  })
);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure CORS
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
    if (!origin) return callback(null, true);

    if (origin.startsWith("chrome-extension://")) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    callback(new Error("Not allowed by CORS"));
  },
  optionsSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

// Main solve endpoint
app.post("/solve", async (req, res) => {
  let isResponseSent = false;

  try {
    const { grid, depth } = req.body;

    if (!grid || !depth) {
      return res.status(400).json({
        error: "Missing required parameters",
        details: "Both grid and depth are required",
      });
    }

    const letters = grid.trim().split(/\s+/);
    // Classic = 4x4 (16), Mini = 3x3 (9)
    if (
      (letters.length !== 9 && letters.length !== 16) ||
      !letters.every((l) => /^[a-zA-Z]$/.test(l))
    ) {
      return res.status(400).json({
        error: "Invalid grid",
        details:
          "Grid must contain 9 (mini) or 16 (classic) single letters separated by spaces",
      });
    }

    const gridSize = letters.length === 9 ? 3 : 4;
    const minDepth = gridSize === 3 ? 3 : 4;
    const maxDepth = letters.length;

    const depthNum = Number(depth);
    if (
      !Number.isInteger(depthNum) ||
      depthNum < minDepth ||
      depthNum > maxDepth
    ) {
      return res.status(400).json({
        error: "Invalid depth",
        details: `Depth must be an integer between ${minDepth} and ${maxDepth} for a ${gridSize}x${gridSize} grid`,
      });
    }

    const solverPath = path.join(
      __dirname,
      "main",
      process.platform === "win32" ? "code.exe" : "code"
    );

    const solver = spawn(solverPath);
    let result = "";
    let errorOutput = "";

    const timeoutMs = Number(process.env.SOLVER_TIMEOUT) || 30000;

    const timeoutId = setTimeout(() => {
      solver.kill("SIGKILL");
    }, timeoutMs);

    const solverPromise = new Promise((resolve, reject) => {
      solver.stdout.on("data", (data) => {
        result += data.toString();
      });

      solver.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      solver.stdin.write(`${grid} ${depthNum}\n`);
      solver.stdin.end();

      solver.on("close", (code, signal) => {
        clearTimeout(timeoutId);
        if (signal === "SIGKILL") {
          reject(new Error("Solver timeout"));
        } else if (code !== 0) {
          reject(new Error(errorOutput || "Solver process failed"));
        } else {
          resolve(result.trim());
        }
      });

      solver.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });

    try {
      const output = await solverPromise;
      if (!isResponseSent) {
        isResponseSent = true;
        res.status(200).json({ output });
      }
    } catch (error) {
      if (!isResponseSent) {
        isResponseSent = true;
        if (error.message === "Solver timeout") {
          res.status(504).json({
            error: "Solver timeout",
            details: "Process took too long to respond",
          });
        } else {
          res.status(500).json({
            error: "Solver process failed",
            details: error.message,
          });
        }
      }
    }
  } catch (error) {
    if (!isResponseSent) {
      isResponseSent = true;
      console.error("Server error:", error);
      res.status(500).json({
        error: "Internal server error",
        details: error.message,
      });
    }
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Internal server error",
    details: err.message,
  });
});

// Start server only when run directly (not imported for testing)
const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

let server;
if (isMainModule) {
  const PORT = process.env.PORT || 3000;
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  process.on("SIGTERM", () => {
    console.log("SIGTERM received. Shutting down gracefully...");
    server.close(() => {
      console.log("Process terminated");
    });
  });
}

export { app, server };
