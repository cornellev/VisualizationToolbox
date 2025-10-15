import React, { useState, useEffect, useRef } from "react";
import Select from "react-select";
import UploadBag from "./UploadBag";
import PointCloudPlayer from "./PointCloudPlayer";

const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");

export default function DynamicTab() {
  const [bag, setBag] = useState(null);
  const [bagList, setBagList] = useState(null);
  const [selected, setSelected] = useState(null);
  const [JSONList, setJSONList] = useState(null);
  const [content, setContent] = useState("nothing here");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleList = (folderName) => setBag(folderName);
  const handleLoad = (state) => setIsLoading(state);

  const handleBagSelect = (opt) => {
    setSelected(opt);
    setBag(opt.label.replace(".json.gz", ""));
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

  const fetchAndVisualize = async () => {
    if (!bag) {
      alert("No bag selected!");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(API_BASE + `/api/rosbags/${bag}`);
      const data = await response.json();
      setJSONList(data.rosbag_json || data);
    } catch (error) {
      console.error("Error fetching bag data:", error);
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
    <div className="parent">
      <div className="left-pane">
        <UploadBag onUploadComplete={handleList} loading={handleLoad} />

        <Select
          options={bagList || []}
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
        <Select options={tools} isDisabled={isLoading} />
        <PointCloudPlayer jsonFrames={JSONList || []} />
      </div>
    </div>
  );
}
