import React, { useState, useEffect } from "react";
import "./App.css";
import Select from "react-select";

function App() {
  const [bag, setBag] = useState(null);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState("nothing here");

  const runPythonScript = async () => {
    const response = await fetch("http://localhost:5000/run-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ param: bag }),
    });

    const data = await response.json();
    setContent(data.stdout);
  };

  useEffect(() => {
    if (bag !== null) {
      runPythonScript();
    }
  }, [bag]);

  const buttonClass = (ind) => {
    return selected === ind ? "selected-button" : "button-css";
  };

  const updateSelected = (event, ind) => {
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
          "file1.dbs",
          "file2.dbs",
          "file3.dbs",
          "file4.dbs",
          "file5.dbs",
          "file6.dbs",
          "file7.dbs",
        ].map((file, index) => (
          <button
            key={index}
            className={buttonClass(index)}
            onClick={(e) => updateSelected(e, index)}
          >
            {file}
          </button>
        ))}
      </div>
      <div>
        <Select options={tools} />
        <textarea className="text" value={content} disabled={true}></textarea>
      </div>
    </div>
  );
}

export default App;
