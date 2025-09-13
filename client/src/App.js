import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import Select from "react-select";
import UploadBag from "./UploadBag";
import pako from "pako";

function App() {
  const [bag, setBag] = useState(null);
  const [bagList, setBagList] = useState(null);
  const [selected, setSelected] = useState(null);
  const [JSONList, setJSONList] = useState(null);
  const [content, setContent] = useState("nothing here");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleList = (folderName) => {
    setBag(folderName);
  };

  const handleLoad = (state) => {
    setIsLoading(state);
  };

  const handleBagSelect = (selectedOption) => {
    setSelected(selectedOption);
    setBag(selectedOption.label.replace(".json.gz", "")); // set bag name without extension
  };

  const fetchBagList = async () => {
    try {
      const response = await fetch("http://localhost:5000/api/rosbags"); // adjust your backend URL
      const data = await response.json();

      // data is expected to be an array of objects: [{ folder_name: "rosbag1" }, ...]
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
      const response = await fetch(
        `http://localhost:5000/api/rosbags/${bag}` // endpoint returns JSON for folder_name
      );
      const data = await response.json();

      setJSONList(data.rosbag_json || data); // depending on how your backend returns the JSON
    } catch (error) {
      console.error("Error fetching bag data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBagList(); // run once on page load
  }, []);

  useEffect(() => {
    if (!JSONList || JSONList.length === 0) return;

    let currentIndex = 0;

    const interval = setInterval(() => {
      setContent(JSON.stringify(JSONList[currentIndex], null, 2));
      currentIndex = (currentIndex + 1) % JSONList.length;
    }, 100);

    return () => clearInterval(interval);
  }, [JSONList]);

  const tools = [
    { value: "pointcloud", label: "Point Cloud" },
    { value: "pointcloud_surfaces", label: "Point Cloud + Surfaces" },
  ];

  return (
    <div className="App">
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

      <div>
        <Select options={tools} disabled={isLoading} />
        <textarea className="text" value={content} disabled={true}></textarea>
      </div>
    </div>
  );
}

export default App;
