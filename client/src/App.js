import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import Select from "react-select";
import UploadBag from "./UploadBag";
import pako from "pako";

const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
const EV_URL = `${API_BASE}/ev/`;

function DataViewer() {
  const [bag, setBag] = useState(null);
  const [bagList, setBagList] = useState(null);
  const [selected, setSelected] = useState(null); 
  const [JSONList, setJSONList] = useState(null);
  const [content, setContent] = useState("nothing here");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null); 


  const [activeTab, setActiveTab] = useState("dynamic"); 

  const handleList = (folderName) => setBag(folderName);
  const handleLoad = (state) => setIsLoading(state);

  const handleBagSelect = (opt) => {
    setSelected(opt);
    setBag(opt.label.replace(".json.gz", ""));
  };

  // Fetch the list of available .gz files from GitHub
  const fetchBagList = async () => {
    const url =
      "https://api.github.com/repos/AjayParthibha/ReplayDashData/contents/data";
    try {
      const resp = await fetch(url);
      const files = await resp.json();
      const gzFiles = (Array.isArray(files) ? files : [])
        .filter((f) => f.name && f.name.endsWith(".json.gz"))
        .map((f) => ({ label: f.name, value: f.download_url }));
      setBagList(gzFiles);
    } catch (e) {
      console.error("Failed to fetch bag list:", e);
    }
  };

  const fetchAndVisualize = async () => {
    if (!bag) {
      alert("No bag selected!");
      return;
    }
    setIsLoading(true);
    try {
      const url = `https://raw.githubusercontent.com/AjayParthibha/ReplayDashData/main/data/${bag}.json.gz`;
      const resp = await fetch(url);
      const compressed = await resp.arrayBuffer();
      const text = pako.inflate(new Uint8Array(compressed), { to: "string" });
      setJSONList(JSON.parse(text));
    } catch (e) {
      console.error("Error fetching/decompressing:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBagList();
  }, []);

  useEffect(() => {
    if (!JSONList || JSONList.length === 0) return;
    let i = 0;
    const id = setInterval(() => {
      setContent(JSON.stringify(JSONList[i], null, 2));
      i = (i + 1) % JSONList.length;
    }, 100);
    return () => clearInterval(id);
  }, [JSONList]);

  const tools = [
    { value: "pointcloud", label: "Point Cloud" },
    { value: "pointcloud_surfaces", label: "Point Cloud + Surfaces" },
  ];

  return (
    <>
      <div className="parent">
        <UploadBag onUploadComplete={handleList} loading={handleLoad} />

        <Select
          options={bagList}
          onChange={handleBagSelect}
          isDisabled={isLoading}
          placeholder="Select a ROSBag to visualize"
        />

        <button
          onClick={fetchAndVisualize}
          className="button-css"
          disabled={isLoading}
        >
          Fetch and Visualize
        </button>

        {isLoading && <div className="spinner"></div>}
      </div>
      <div className="right-pane">
        <div className="tabs" style={{ marginBottom: 12 }}>
          <button
            onClick={() => setActiveTab("dynamic")}
            className={`tab ${activeTab === "dynamic" ? "active" : ""}`}
            aria-selected={activeTab === "dynamic"}
            role="tab"
          >
            Dynamic
          </button>
          <button
            onClick={() => setActiveTab("static")}
            className={`tab ${activeTab === "static" ? "active" : ""}`}
            aria-selected={activeTab === "static"}
            role="tab"
          >
            Static
          </button>
        </div>

        {activeTab === "dynamic" ? (
          <>
            <Select options={tools} isDisabled={isLoading} />
            <textarea className="text" value={content} disabled={true}></textarea>
          </>
        ) : (
          <div style={{ height: "70vh", width: "100%" }}>
            <iframe
              title="Run Data Analysis"
              src={EV_URL}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                borderRadius: 8,
                boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
                background: "#fff",
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}

export default function App() {
  return (
    <div className="App">
      <DataViewer />
    </div>
  );
}
