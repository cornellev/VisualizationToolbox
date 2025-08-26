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

  // Fetch the list of available .gz files from GitHub
  const fetchBagList = async () => {
    const url =
      "https://api.github.com/repos/AjayParthibha/ReplayDashData/contents/data"; // change path if needed
    try {
      const response = await fetch(url);
      const files = await response.json();

      const gzFiles = files
        .filter((file) => file.name.endsWith(".json.gz"))
        .map((file) => ({
          label: file.name,
          value: file.download_url, // directly store download URL
        }));

      setBagList(gzFiles);
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
    const url = `https://raw.githubusercontent.com/AjayParthibha/ReplayDashData/main/data/${bag}.json.gz`;

    try {
      const response = await fetch(url);
      const compressedData = await response.arrayBuffer();

      const decompressed = pako.inflate(new Uint8Array(compressedData), {
        to: "string",
      });
      const data = JSON.parse(decompressed);

      setJSONList(data);
    } catch (error) {
      console.error("Error fetching and decompressing:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current.click();
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

  const buttonClass = (ind) => {
    return selected === ind ? "selected-button" : "button-css";
  };

  const updateSelected = (event, ind) => {
    if (isLoading) return;
    setSelected(ind);
    setBag(event.target.textContent);
    console.log(event.target.textContent);
  };

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
