import React, { useState, useEffect, useRef } from "react";
import Select from "react-select";
import UploadBag from "./UploadBag";
import PointCloudPlayer from "./PointCloudPlayer";
import RawDataViewer from "./RawDataViewer";

const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
const DEFAULT_STREAM_LIMIT = parseInt(
  process.env.REACT_APP_ROSBAG_CHUNK_SIZE || "250",
  10
);

export default function DynamicTab() {
  const [bag, setBag] = useState(null);
  const [bagList, setBagList] = useState(null);
  const [topicOptions, setTopicOptions] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [JSONList, setJSONList] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamStatus, setStreamStatus] = useState("");
  const [streamError, setStreamError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [frameLimit, setFrameLimit] = useState(DEFAULT_STREAM_LIMIT);
  const toolOptions = [
    { value: "pointcloud", label: "Point Cloud" },
    { value: "raw", label: "Raw Data" },
  ];
  const [selectedTool, setSelectedTool] = useState(toolOptions[0]);

  const streamControllerRef = useRef(null);

  const handleList = (folderName) => {
    stopStreaming({ silent: true });
    setBag(folderName);
    resetPlayback();
  };
  const handleLoad = (state) => setIsLoading(state);

  const stopStreaming = ({ silent = false } = {}) => {
    const controller = streamControllerRef.current;
    if (controller) {
      controller.abort();
      streamControllerRef.current = null;
    }
    setIsStreaming(false);
    if (!silent) {
      setStreamStatus((prev) => prev || "Stream cancelled");
    }
  };

  const resetPlayback = () => {
    setJSONList([]);
    setStreamError(null);
    setStreamStatus("");
  };

  const handleFrameLimitChange = (event) => {
    const value = Number(event.target.value);
    if (Number.isNaN(value)) {
      setFrameLimit(0);
      return;
    }
    const clamped = Math.max(1, Math.min(5000, value));
    setFrameLimit(clamped);
  };

  const handleBagSelect = (opt) => {
    stopStreaming({ silent: true });
    if (!opt) {
      setBag(null);
      setTopicOptions([]);
      setSelectedTopic(null);
      resetPlayback();
      return;
    }
    setBag(opt.value);
    resetPlayback();
  };

  const fetchBagList = async () => {
    try {
      const response = await fetch(API_BASE + "/api/rosbags");
      const data = await response.json();
      const options = data.map((bag) => ({
        label: bag.folder_name,
        value: bag.folder_name,
      }));
      setBagList(options);
    } catch (error) {
      console.error("Failed to fetch bag list:", error);
    }
  };

  const fetchTopics = async (folderName) => {
    if (!folderName) {
      setTopicOptions([]);
      setSelectedTopic(null);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/api/rosbags/${folderName}/topics`
      );
      const data = await response.json();
      const options = (data.topics || []).map((topic) => ({
        label: topic,
        value: topic,
      }));

      setTopicOptions(options);
      const preferred =
        options.find((opt) => opt.value.toLowerCase().includes("pointcloud")) ||
        options[0] ||
        null;
      setSelectedTopic(preferred);
    } catch (error) {
      console.error("Failed to fetch topics:", error);
      setTopicOptions([]);
      setSelectedTopic(null);
    }
  };

  const startStreaming = async () => {
    if (!bag) {
      alert("Select a ROS bag first");
      return;
    }
    if (!selectedTopic) {
      alert("Select a topic to visualize");
      return;
    }

    stopStreaming({ silent: true });
    resetPlayback();
    setIsStreaming(true);
    setStreamStatus("Connecting...");

    const controller = new AbortController();
    streamControllerRef.current = controller;

    const params = new URLSearchParams();
    params.set("topic", selectedTopic.value);
    if (frameLimit > 0) {
      params.set("limit", String(frameLimit));
    }

    const handleLine = (line) => {
      if (!line) return;
      let payload;
      try {
        payload = JSON.parse(line);
      } catch (err) {
        console.warn("Skipping malformed stream chunk", err);
        return;
      }

      if (payload.type === "meta") {
        if (payload.status === "complete") {
          setStreamStatus("Stream complete");
        } else if (payload.status === "aborted") {
          setStreamStatus("Stream aborted");
        } else {
          const topicLabel = payload.topic || selectedTopic?.value || "selected topic";
          setStreamStatus(
            `Streaming ${topicLabel}${
              payload.limit ? ` (limit ${payload.limit})` : ""
            }`
          );
        }
        return;
      }

      if (payload.type === "error") {
        throw new Error(payload.message || "Stream error");
      }

      setJSONList((prev) => [...prev, payload]);
    };

    const consumeBuffer = (decoder, reader) => {
      let buffer = "";

      const flushBuffer = (final = false) => {
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          handleLine(line);
        }
        if (final) {
          const trailing = buffer.trim();
          if (trailing) {
            handleLine(trailing);
          }
          buffer = "";
        }
      };

      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (value) {
              buffer += decoder.decode(value, { stream: true });
              flushBuffer();
            }
            if (done) break;
          }
          buffer += decoder.decode();
          flushBuffer(true);
        } catch (err) {
          throw err;
        }
      };

      return pump();
    };

    try {
      const response = await fetch(
        `${API_BASE}/api/rosbags/${bag}/stream?${params.toString()}`,
        {
          signal: controller.signal,
          headers: { Accept: "application/x-ndjson" },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to stream rosbag (${response.status})`);
      }

      if (!response.body) {
        throw new Error("Streaming is not supported by this browser");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      await consumeBuffer(decoder, reader);

      setStreamStatus((prev) => prev || "Stream complete");
    } catch (error) {
      if (controller.signal.aborted) {
        setStreamStatus("Stream cancelled");
      } else {
        console.error("Error streaming bag data:", error);
        setStreamError(error.message);
        setStreamStatus("Stream failed");
      }
    } finally {
      if (streamControllerRef.current === controller) {
        streamControllerRef.current = null;
      }
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    fetchBagList();
  }, []);

  useEffect(() => {
    return () => stopStreaming({ silent: true });
  }, []);

  useEffect(() => {
    if (!bag) return;
    fetchTopics(bag);
  }, [bag]);

  return (
    <div className="parent">
      <div className="left-pane">
        <UploadBag onUploadComplete={handleList} loading={handleLoad} />

        <Select
          options={bagList || []}
          onChange={handleBagSelect}
          isDisabled={isLoading || isStreaming}
          placeholder="Select a ROSBag to visualize"
        />

        <Select
          options={topicOptions}
          value={selectedTopic}
          onChange={(opt) => {
            stopStreaming({ silent: true });
            setSelectedTopic(opt);
            resetPlayback();
          }}
          isDisabled={isLoading || isStreaming || !topicOptions.length}
          placeholder="Select a topic"
          styles={{ menu: (base) => ({ ...base, zIndex: 20 }) }}
        />

        <label className="input-label" htmlFor="frame-limit-input">
          Max frames per stream
          <input
            id="frame-limit-input"
            type="number"
            min={1}
            max={5000}
            value={frameLimit}
            onChange={handleFrameLimitChange}
            disabled={isStreaming}
          />
          <small>Applies to the next stream request.</small>
        </label>

        <button
          onClick={startStreaming}
          className="button-css"
          disabled={isLoading || isStreaming}
        >
          {isStreaming ? "Streaming…" : "Stream and Visualize"}
        </button>

        {isStreaming && (
          <button onClick={() => stopStreaming()} className="button-css">
            Stop Stream
          </button>
        )}

        {(isLoading || isStreaming) && <div className="spinner"></div>}

        <div className="stream-status">
          {streamStatus && <div>{streamStatus}</div>}
          {streamError && (
            <div style={{ color: "#ff5252" }}>Error: {streamError}</div>
          )}
          {!!JSONList.length && (
            <div>
              Buffered {JSONList.length} frame{JSONList.length === 1 ? "" : "s"}
            </div>
          )}
        </div>
      </div>

      <div className="right-pane">
        <Select
          options={toolOptions}
          value={selectedTool}
          onChange={(opt) => setSelectedTool(opt || toolOptions[0])}
          isDisabled={isLoading}
        />
        {selectedTool?.value === "raw" ? (
          <RawDataViewer frames={JSONList || []} />
        ) : (
          <PointCloudPlayer jsonFrames={JSONList || []} />
        )}
      </div>
    </div>
  );
}
