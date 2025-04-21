const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = "temp-uploads";
    fs.mkdir(tempDir, { recursive: true }, (err) => {
      cb(err, tempDir);
    });
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

app.post("/upload-folder", upload.array("files"), async (req, res) => {
  if (req.files) {
    console.log("FILES RECEIVED:", req.files);
  } else {
    console.log("No files received");
    res.status(400).send("Error during upload");
  }

  if (!req.files || req.files.length < 2) {
    return res.status(400).send("Need yaml and db3 in the folder");
  }

  const db3File = req.files.find((file) => file.originalname.endsWith(".db3"));

  if (!db3File) {
    return res.status(400).send("No .db3 file found in upload.");
  }

  const folderName = path.parse(db3File.originalname).name;
  const finalFolderPath = path.join("uploads-folder", folderName);

  try {
    await fs.promises.mkdir(finalFolderPath, { recursive: true });

    await Promise.all(
      req.files.map((file) => {
        const dest = path.join(finalFolderPath, file.originalname);
        return fs.promises.rename(file.path, dest);
      })
    );

    console.log("Created folder:", folderName);
    console.log("Files saved in:", finalFolderPath);
  } catch (err) {
    console.error("Error organizing files:", err);
    res.status(500).send("Internal server error while organizing files.");
  }

  const python = spawn("python3", ["script.py", folderName]);

  python.stdout.on("data", (data) => {
    console.log(`stdout: ${data}`);
  });

  python.stderr.on("data", (data) => {
    console.error(`stderr: ${data}`);
  });

  python.on("close", (code) => {
    const data = JSON.parse(
      fs.readFileSync(`saved_data/${folderName}.json`, "utf-8") // JSON save directory
    );
    res.json(data);
  });
});

app.post("/get-json", (req, res) => {
  const data = JSON.parse(
    fs.readFileSync(`saved_data/${folderName}.json`, "utf-8") // JSON save directory
  );
  res.json(data);
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
