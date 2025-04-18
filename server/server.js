const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/run-script", (req, res) => {
  console.log("Received request with param:", req.body.param);
  const param = req.body.param || "";

  const python = spawn("python3", ["script.py", param]);

  python.stdout.on("data", (data) => {
    console.log(`stdout: ${data}`);
  });

  python.stderr.on("data", (data) => {
    console.error(`stderr: ${data}`);
  });

  python.on("close", (code) => {
    const data = JSON.parse(
      fs.readFileSync(`saved_data/${param}.json`, "utf-8") // JSON save directory
    );
    res.json(data);
  });
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
