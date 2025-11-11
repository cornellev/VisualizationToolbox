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

const csv = require("csv-parser");

app.post("/upload-csv", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).send("No CSV file uploaded");

  if (!req.file.originalname.toLowerCase().endsWith(".csv")) {
    return res.status(400).send("Uploaded file must be a .csv");
  }

  const filePath = req.file.path;
  const rows = [];

  try {
    // Parse the CSV into an array of objects
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => rows.push(row))
        .on("end", resolve)
        .on("error", reject);
    });

    if (rows.length === 0) {
      await fs.promises.unlink(filePath).catch(() => {});
      return res.status(400).send("CSV file is empty or invalid");
    }

    const headers = Object.keys(rows[0]);
    const name = path.parse(req.file.originalname).name;

    console.log(`Parsed CSV: ${name} (${rows.length} rows)`);

    await pool.query(
      `
      INSERT INTO csv_uploads (name, headers, data)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (name) DO UPDATE
      SET headers = EXCLUDED.headers,
          data = EXCLUDED.data,
          uploaded_at = NOW()
      `,
      [name, headers, JSON.stringify(rows)]
    );

    await fs.promises.unlink(filePath).catch(() => {});

    return res.json({
      message: "CSV uploaded successfully",
      name,
      headers,
      rows: rows.length,
    });
  } catch (err) {
    console.error("CSV upload failed:", err);
    await fs.promises.unlink(filePath).catch(() => {});
    return res.status(500).json({ error: "Failed to process CSV" });
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
  const topic = req.query.topic; 

  try {
    let query = `
      SELECT topic, timestamp, data
      FROM rosbag_messages
      WHERE bag_name = $1
    `;
    const params = [folderName];

    // Add filtering if topic is provided
    if (topic) {
      query += " AND topic = $2";
      params.push(topic);
    }

    query += " ORDER BY timestamp ASC";

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      console.warn(`No messages found for bag='${folderName}'${topic ? ` and topic='${topic}'` : ""}`);
      return res.status(404).json({ error: "No messages found for this bag/topic" });
    }

    // Return the filtered messages
    res.json(result.rows);

  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// GET /api/csv
app.get("/api/csv", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, uploaded_at FROM csv_uploads ORDER BY uploaded_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching CSV list:", err);
    res.status(500).json({ error: "Failed to fetch CSV list" });
  }
});

// GET /api/csv/:name
app.get("/api/csv/:name", async (req, res) => {
  const { name } = req.params;
  try {
    const result = await pool.query(
      "SELECT headers, data FROM csv_uploads WHERE name = $1",
      [name]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "No CSV found" });
    res.json(result.rows[0]); // { headers, data }
  } catch (err) {
    console.error("Error fetching CSV:", err);
    res.status(500).json({ error: "Failed to fetch CSV" });
  }
});

// GET /api/rosbags/:folderName/topics
app.get("/api/rosbags/:folderName/topics", async (req, res) => {
  const { folderName } = req.params;
  try {
    const result = await pool.query(
      "SELECT DISTINCT topic FROM rosbag_messages WHERE bag_name = $1 ORDER BY topic ASC",
      [folderName]
    );
    res.json({ topics: result.rows.map((r) => r.topic) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
});
