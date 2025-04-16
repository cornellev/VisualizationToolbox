const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/run-script", (req, res) => {
  const param = req.body.param || "";

  const python = spawn("python3", ["script.py", param]);

  let output = "";
  let error = "";

  python.stdout.on("data", (data) => {
    output += data.toString();
  });

  python.stderr.on("data", (data) => {
    error += data.toString();
  });

  python.on("close", (code) => {
    res.json({
      returncode: code,
      stdout: output,
      stderr: error,
    });
  });
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
