const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const axios = require("axios");
const { createProxyMiddleware } = require("http-proxy-middleware");
require("dotenv").config();
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = "temp-uploads";
    fs.mkdir(tempDir, { recursive: true }, (err) => cb(err, tempDir));
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

app.post("/upload-folder", upload.array("files"), async (req, res) => {
  if (!req.files || req.files.length < 2) {
    return res.status(400).send("Need at least a YAML and DB3 file");
  }

  const db3File = req.files.find((f) => f.originalname.endsWith(".db3"));
  if (!db3File) return res.status(400).send("No .db3 file found");

  const folderName = path.parse(db3File.originalname).name;
  const finalFolderPath = path.join("uploads-folder", folderName);
  const pyworkerUrl = process.env.PYWORKER_URL || "http://pyworker:8000";

  try {
    await fs.promises.mkdir(finalFolderPath, { recursive: true });

    await Promise.all(
      req.files.map(async (file) => {
        const dest = path.join(finalFolderPath, file.originalname);
        await fs.promises.copyFile(file.path, dest);
        await fs.promises.unlink(file.path);
      })
    );

    console.log(
      `Created folder: ${folderName}, files saved in ${finalFolderPath}`
    );

    // Call pyworker to process the bag
    const response = await axios.post(`${pyworkerUrl}/process/${folderName}`);
    console.log("Pyworker response:", response.data);

    // Return success directly; pyworker already inserted into DB
    res.json({
      message: "Upload and processing complete",
      folder: folderName,
      pyworker: response.data,
    });
  } catch (err) {
    console.error("Upload pipeline failed:", err.message || err);
    if (!res.headersSent)
      res.status(500).json({ error: "Failed uploading or processing" });
  }
});

app.listen(5000, () => console.log("Server running on http://localhost:5000"));

process.on("uncaughtException", (err) =>
  console.error("Uncaught Exception:", err)
);
process.on("unhandledRejection", (reason) =>
  console.error("Unhandled Rejection:", reason)
);

// GET /api/rosbags
app.get("/api/rosbags", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT folder_name FROM rosbags ORDER BY created_at DESC"
    );
    res.json(result.rows); // [{ folder_name: 'rosbag1' }, ...]
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch rosbags" });
  }
});

// GET /api/rosbags/:folderName
app.get("/api/rosbags/:folderName", async (req, res) => {
  const { folderName } = req.params;
  try {
    // Fetch all messages for the given folder
    const result = await pool.query(
      `SELECT topic, timestamp, data
       FROM rosbag_messages
       WHERE bag_name = $1
       ORDER BY timestamp ASC`,
      [folderName]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No messages found for this bag" });
    }

    res.json(result.rows); // return all messages in order
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});
