import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const SERVER_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

// CI compiles the solver next to the source; the container puts it in main/.
export const DEFAULT_SOLVER = process.env.SOLVER_BIN || path.join(SERVER_ROOT, "code");

/**
 * Runs the C++ solver over one grid. Returns bare words: the solver emits
 * "word:row,col:directions" and only the extension needs the path data.
 */
export function runSolver(grid, depth, { binary = DEFAULT_SOLVER, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const solver = spawn(binary);
    let output = "";
    let errorOutput = "";

    const timer = setTimeout(() => solver.kill("SIGKILL"), timeoutMs);

    solver.stdout.on("data", (d) => (output += d.toString()));
    solver.stderr.on("data", (d) => (errorOutput += d.toString()));
    solver.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    solver.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal === "SIGKILL") return reject(new Error("Solver timed out"));
      if (code !== 0) return reject(new Error(`Solver exited ${code}: ${errorOutput}`));
      resolve(
        output
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((token) => token.split(":")[0])
      );
    });

    solver.stdin.write(`${grid} ${depth}\n`);
    solver.stdin.end();
  });
}
