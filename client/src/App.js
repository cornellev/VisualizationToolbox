import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import Select from "react-select";
import UploadBag from "./UploadBag";

function App() {
  const [bag, setBag] = useState(null);
  const [selected, setSelected] = useState(null);
  const [JSONList, setJSONList] = useState(null);
  const [content, setContent] = useState("nothing here");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleList = (list) => {
    setJSONList(list);
  };

  const handleLoad = (state) => {
    setIsLoading(state);
  };
  /*
  const handleLoading = (list) => {
    setIsLoading(list);
  };*/

  const runPythonScript = async () => {
    setIsLoading(true);
    const response = await fetch("http://localhost:5000/run-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ param: bag }),
    });

    const data = await response.json();
    setJSONList(data);
    setIsLoading(false);
  };

  const handleButtonClick = () => {
    fileInputRef.current.click();
  };

  useEffect(() => {
    if (bag !== null) {
      runPythonScript();
    }
  }, [bag]);

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
        {[].map((file, index) => (
          <button
            key={index}
            className={buttonClass(index)}
            onClick={(e) => updateSelected(e, index)}
            disabled={isLoading}
          >
            {file}
          </button>
        ))}

        <UploadBag JSONList={handleList} loading={handleLoad} />

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
