const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const axios = require("axios");
const { createProxyMiddleware } = require("http-proxy-middleware");
const QueryStream = require("pg-query-stream");
require("dotenv").config();
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const DEFAULT_ROS_MESSAGE_LIMIT = parseInt(
  process.env.ROS_MESSAGE_LIMIT || "500",
  10
);
const MAX_ROS_MESSAGE_LIMIT = parseInt(
  process.env.ROS_MESSAGE_MAX_LIMIT || "2000",
  10
);
const ROS_STREAM_BATCH_SIZE = parseInt(
  process.env.ROS_STREAM_BATCH_SIZE || "100",
  10
);
const ROS_STREAM_HIGH_WATERMARK = parseInt(
  process.env.ROS_STREAM_HIGH_WATERMARK || "16",
  10
);

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
  const { topic, cursor } = req.query;
  const rawLimit = parseInt(req.query.limit, 10);
  const limit = Math.min(
    Math.max(isNaN(rawLimit) ? DEFAULT_ROS_MESSAGE_LIMIT : rawLimit, 1),
    MAX_ROS_MESSAGE_LIMIT
  );

  try {
    let paramIndex = 1;
    let query = `
      SELECT topic, timestamp, data::text AS data
      FROM rosbag_messages
      WHERE bag_name = $${paramIndex}
    `;
    const params = [folderName];

    if (topic) {
      params.push(topic);
      paramIndex++;
      query += ` AND topic = $${paramIndex}`;
    }

    if (cursor) {
      params.push(cursor);
      paramIndex++;
      query += ` AND timestamp > $${paramIndex}`;
    }

    params.push(limit + 1);
    query += ` ORDER BY timestamp ASC LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    let rows = result.rows;
    const hasMore = rows.length > limit;
    if (hasMore) {
      rows = rows.slice(0, limit);
    }

    if (rows.length === 0) {
      return res.json({ messages: [], nextCursor: null, hasMore: false, count: 0 });
    }

    const messages = rows.map((row) => {
      let dataPayload;
      try {
        dataPayload = row.data ? JSON.parse(row.data) : null;
      } catch (err) {
        console.warn("Failed to parse rosbag payload for", folderName, err.message);
        dataPayload = row.data;
      }

      return {
        topic: row.topic,
        timestamp:
          typeof row.timestamp === "bigint"
            ? row.timestamp.toString()
            : String(row.timestamp),
        data: dataPayload,
      };
    });

    const nextCursor = hasMore
      ? messages[messages.length - 1].timestamp
      : null;

    res.json({
      messages,
      nextCursor,
      hasMore,
      count: messages.length,
      limit,
    });
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Stream /api/rosbags/:folderName/stream
app.get("/api/rosbags/:folderName/stream", async (req, res) => {
  const { folderName } = req.params;
  const { topic } = req.query;
  const rawLimit = parseInt(req.query.limit, 10);
  const limit = isNaN(rawLimit)
    ? null
    : Math.min(Math.max(rawLimit, 1), MAX_ROS_MESSAGE_LIMIT);

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error("Failed to acquire DB client for stream:", err);
    return res.status(500).json({ error: "Failed to start stream" });
  }

  let query = `
      SELECT topic, timestamp, data::text AS data
    FROM rosbag_messages
    WHERE bag_name = $1
  `;
  const params = [folderName];

  if (topic) {
    params.push(topic);
    query += ` AND topic = $${params.length}`;
  }

  query += " ORDER BY timestamp ASC";

  if (limit !== null) {
    params.push(limit);
    query += ` LIMIT $${params.length}`;
  }

  const queryStream = new QueryStream(query, params, {
    highWaterMark: ROS_STREAM_HIGH_WATERMARK,
    batchSize: ROS_STREAM_BATCH_SIZE,
  });

  const stream = client.query(queryStream);
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Transfer-Encoding", "chunked");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const writeJsonLine = (payload) =>
    res.write(`${JSON.stringify(payload)}\n`, "utf8");

  writeJsonLine({
    type: "meta",
    bag: folderName,
    topic: topic || null,
    limit,
  });

  let rowCount = 0;
  let clientReleased = false;
  let streamClosed = false;

  const releaseClient = () => {
    if (!clientReleased) {
      clientReleased = true;
      client.release();
    }
  };

  const closeStream = () => {
    if (!streamClosed) {
      streamClosed = true;
      stream.destroy();
    }
  };

  stream.on("data", (row) => {
    rowCount += 1;
    const timestampValue =
      typeof row.timestamp === "bigint"
        ? row.timestamp.toString()
        : String(row.timestamp);
    const topicValue = JSON.stringify(row.topic ?? null);
    const rawData =
      typeof row.data === "string"
        ? row.data
        : row.data?.toString("utf8") ?? "null";
    const trimmedData = rawData.trim();
    const dataText = trimmedData.length ? trimmedData : "null";

    const payloadLine = `{"topic":${topicValue},"timestamp":"${timestampValue}","data":${dataText}}\n`;

    const shouldContinue = res.write(payloadLine, "utf8");
    if (!shouldContinue) {
      stream.pause();
      res.once("drain", () => stream.resume());
    }
  });

  stream.on("end", () => {
    streamClosed = true;
    writeJsonLine({ type: "meta", status: "complete", rows: rowCount });
    res.end();
    releaseClient();
  });

  stream.on("error", (err) => {
    console.error("Rosbag stream failed:", err);
    if (res.writableEnded) {
      // connection already closed
    } else if (!res.headersSent) {
      res.status(500).json({ error: "Stream failed" });
    } else {
      writeJsonLine({ type: "error", message: "Stream failed" });
      res.end();
    }
    closeStream();
    releaseClient();
  });

  req.on("aborted", () => {
    closeStream();
    releaseClient();
  });

  res.on("close", () => {
    closeStream();
    releaseClient();
  });
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
