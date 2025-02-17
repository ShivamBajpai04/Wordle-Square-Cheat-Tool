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
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow any chrome extension
    if (origin.startsWith("chrome-extension://")) {
      return callback(null, true);
    }

    // Check against allowed origins
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
  try {
    const { grid, depth } = req.body;

    // Validate input
    if (!grid || !depth) {
      return res.status(400).json({
        error: "Missing required parameters",
        details: "Both grid and depth are required",
      });
    }

    if (depth < 4 || depth > 16) {
      return res.status(400).json({
        error: "Invalid depth",
        details: "Depth must be between 4 and 16",
      });
    }

    // Get path to C++ executable
    const solverPath = path.join(
      __dirname,
      "main",
      process.platform === "win32" ? "code.exe" : "code"
    );

    // Track if response has been sent
    let isResponseSent = false;

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Solver timeout"));
      }, process.env.SOLVER_TIMEOUT || 30000);
    });

    // Create solver promise
    const solverPromise = new Promise((resolve, reject) => {
      const solver = spawn(solverPath);
      let result = "";
      let errorOutput = "";

      solver.stdout.on("data", (data) => {
        result += data.toString();
      });

      solver.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      solver.stdin.write(`${grid} ${depth}\n`);
      solver.stdin.end();

      solver.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(errorOutput || "Solver process failed"));
        } else {
          resolve(result.trim());
        }
      });

      solver.on("error", (error) => {
        reject(error);
      });
    });

    // Race between solver and timeout
    try {
      const result = await Promise.race([solverPromise, timeoutPromise]);
      if (!isResponseSent) {
        isResponseSent = true;
        res.status(200).json({ output: result });
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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Process terminated");
  });
});
