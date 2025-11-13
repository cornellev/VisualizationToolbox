import React, { useState, useEffect, useMemo, useRef } from "react";
import Slider from "@mui/material/Slider";

const MAX_PREVIEW_CHARS = parseInt(
  process.env.REACT_APP_RAW_PREVIEW_LIMIT || "20000",
  10
);

export default function RawDataViewer({ frames = [] }) {
  const [index, setIndex] = useState(0);
  const previewCacheRef = useRef(new Map());

  useEffect(() => {
    setIndex(0);
  }, [frames.length]);

  useEffect(() => {
    if (!frames.length) {
      previewCacheRef.current.clear();
    }
  }, [frames.length]);

  const frame = frames[index] || null;
  const prettyData = useMemo(() => {
    if (!frame) return "No frames buffered yet.";
    const cacheKey = frame.timestamp || `${index}`;
    if (previewCacheRef.current.has(cacheKey)) {
      return previewCacheRef.current.get(cacheKey);
    }

    const payload = frame.data ?? frame;
    let result;
    try {
      result =
        typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    } catch (err) {
      result = String(payload);
    }

    if (result.length > MAX_PREVIEW_CHARS) {
      const omitted = result.length - MAX_PREVIEW_CHARS;
      result =
        result.slice(0, MAX_PREVIEW_CHARS) +
        `\n... truncated (${omitted.toLocaleString()} chars omitted) ...`;
    }

    previewCacheRef.current.set(cacheKey, result);
    if (previewCacheRef.current.size > 100) {
      const firstKey = previewCacheRef.current.keys().next().value;
      previewCacheRef.current.delete(firstKey);
    }

    return result;
  }, [frame, index]);

  const handleIndexChange = (event, value) => {
    if (Array.isArray(value)) return;
    setIndex(value);
  };

  return (
    <div className="raw-viewer">
      <div className="raw-viewer__controls">
        <div>
          Frame {frames.length ? index + 1 : 0}/{frames.length || 0}
        </div>
        <div className="raw-viewer__meta">
          {frame?.timestamp && (
            <span>Timestamp: {frame.timestamp}</span>
          )}
          {frame?.topic && <span>Topic: {frame.topic}</span>}
        </div>
        <Slider
          value={frames.length ? index : 0}
          min={0}
          max={Math.max(frames.length - 1, 0)}
          step={1}
          onChange={handleIndexChange}
          disabled={!frames.length}
        />
      </div>
      <pre className="raw-viewer__pre">{prettyData}</pre>
    </div>
  );
}
