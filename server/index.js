import express from "express";
import { spawn } from "child_process";
import path from "path";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/add", (req, res) => {
  const { word, password } = req.body;
  const pathToCpp = path.join(path.resolve(), "../main/util.exe");
  console.log(a);
  return;
  // const cppProcess = spawn("../main/code.exe");
});

app.post("/solve", async (req, res) => {
  const grid = req.body.grid;
  const depth = req.body.depth;
  console.log(grid, depth);
  const pathToCpp = path.join(path.resolve(), "../main/code.exe");
  const cppProcess = spawn(pathToCpp);
  cppProcess.stdin.write(grid + " " + depth + "\n");
  cppProcess.stdin.end();
  let result = "";

  cppProcess.stdout.on("data", (data) => {
    result += data.toString();
  });
  cppProcess.on("close", () => {
    // console.log("result: " + result);
    res.status(200).json({ output: result.trim() });
  });
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
