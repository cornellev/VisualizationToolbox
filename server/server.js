const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const zlib = require("zlib");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const GITHUB_USERNAME = "AjayParthibha";
const GITHUB_REPO = "ReplayDashData";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_BRANCH = "main";

app.use((req, _, next) => {
  console.log(
    new Date().toISOString(),
    req.method,
    req.url,
    req.body,
    req.files
  );
  next();
});

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
  console.log("Setting up /upload-folder endpoint...");
  if (req.files) {
    console.log("FILES RECEIVED:", req.files);
  } else {
    console.log("No files received");
    return res.status(400).send("Error during upload");
  }

  if (!req.files || req.files.length < 2) {
    return res.status(400).send("Need yaml and db3 in the folder");
  }

  const db3File = req.files.find((file) => file.originalname.endsWith(".db3"));

  if (!db3File) {
    return res.status(400).send("No .db3 file found in upload.");
  }

  const folderName = path.parse(db3File.originalname).name;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileBaseName = `${folderName}_${timestamp}`;
  const finalFolderPath = path.join("uploads-folder", folderName);
  const pyworkerUrl = process.env.PYWORKER_URL || "http://pyworker:8000";

  try {
    // Save uploaded files into final folder
    await fs.promises.mkdir(finalFolderPath, { recursive: true });

    const fsExtra = require("fs-extra"); // or just use fs/promises

    await Promise.all(
      req.files.map(async (file) => {
        const dest = path.join(finalFolderPath, file.originalname);
        // Copy file to final folder
        await fs.promises.copyFile(file.path, dest);
        // Delete the original temp file
        await fs.promises.unlink(file.path);
      })
    );

    console.log("Created folder:", folderName);
    console.log("Files saved in:", finalFolderPath);
  } catch (err) {
    console.error("Error organizing files:", err);
    return res
      .status(500)
      .send("Internal server error while organizing files.");
  }

  try {
    const response = await axios.post(`${pyworkerUrl}/process/${folderName}`);
    console.log("Pyworker response:", response.data);

    const jsonFilePath = `saved_data/${folderName}.json`;
    const compressedPath = `saved_compressed/${folderName}.json.gz`;

    const jsonData = await fs.promises.readFile(jsonFilePath, "utf-8");
    const compressed = zlib.gzipSync(jsonData);
    await fs.promises.writeFile(compressedPath, compressed);

    console.log("Compressed and saved to:", compressedPath);

    const githubPath = `data/${fileBaseName}.json.gz`;
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${githubPath}`;

    // Check for existing file
    let sha;
    try {
      const existing = await axios.get(url, {
        headers: { Authorization: `token ${GITHUB_TOKEN}` },
      });
      sha = existing.data.sha;
    } catch (err) {
      if (!(err.response && err.response.status === 404)) {
        console.error(
          "GitHub check failed:",
          err.response?.data || err.message
        );
        return res.status(500).json({ error: "GitHub pre-check failed" });
      }
    }

    await axios.put(
      url,
      {
        message: `Upload ${folderName}.json.gz`,
        content: compressed.toString("base64"),
        branch: GITHUB_BRANCH,
        ...(sha && { sha }),
      },
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`Uploaded ${githubPath} to GitHub repo.`);
    res.json({ message: "Upload complete", folder: fileBaseName });
  } catch (err) {
    console.error("Upload pipeline failed:", err.response?.data || err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed after compression/upload" });
    }
  }
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
});
