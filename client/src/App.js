import React, { useState, useEffect } from "react";
import "./App.css";
import Select from "react-select";

function App() {
  const [bag, setBag] = useState(null);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState("nothing here");
  const [isLoading, setIsLoading] = useState(false);

  const runPythonScript = async () => {
    setIsLoading(true);
    const response = await fetch("http://localhost:5000/run-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ param: bag }),
    });

    const data = await response.json();
    setContent(JSON.stringify(data, null, 2));
    setIsLoading(false);
  };

  useEffect(() => {
    if (bag !== null) {
      runPythonScript();
    }
  }, [bag]);

  useEffect(() => {});

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
        {[
          "360_scans_per_cloud",
          "180_scans_per_cloud",
          "90_scans_per_cloud",
          "test",
          "chair",
          "whiteboard",
        ].map((file, index) => (
          <button
            key={index}
            className={buttonClass(index)}
            onClick={(e) => updateSelected(e, index)}
            disabled={isLoading}
          >
            {file}
          </button>
        ))}
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
