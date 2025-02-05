import express from "express";
import { spawn } from "child_process";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});
app.post("/solve", async (req, res) => {
  const grid = req.body.grid;
  const depth = req.body.depth;
  console.log(grid, depth);
  typeof grid === "string" && typeof depth === "number" ? console.log("Valid input"): res.status(400).json({ error: "Invalid input" });
  const cppProcess = spawn("../main/code.exe");
  cppProcess.stdin.write(grid + " " + depth + "\n");
  cppProcess.stdin.end();
  let result = "";

  cppProcess.stdout.on("data", (data) => {
    result += data.toString();
  });

  cppProcess.on("close", () => {
    res.json({ output: result.trim() });
  });
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
