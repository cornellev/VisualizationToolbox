import React, { useEffect, useState } from "react";
import Select from "react-select";
import UploadCsv from "./UploadCsv";

const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
const EV_URL = process.env.REACT_APP_EV_URL || "http://localhost:8000/ev/";

export default function StaticTab() {
  const [csvList, setCsvList] = useState([]);
  const [selectedCsv, setSelectedCsv] = useState(null);
  const [bagList, setBagList] = useState([]);
  const [selectedBag, setSelectedBag] = useState(null);
  const [bagMessages, setBagMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // fetch csv from backend
  const fetchCsvList = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/csv`);
      const data = await response.json();
      setCsvList(
        data.map((csv) => ({
          label: csv.name,
          value: csv.name,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch CSV list:", err);
    }
  };

  useEffect(() => {
    fetchCsvList();
  }, []);

  // fetch rosbag list from backend
  const fetchBagList = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/rosbags`);
      const data = await response.json();
      setBagList(
        data.map((bag) => ({
          label: bag.folder_name,
          value: bag.folder_name,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch bag list:", err);
    }
  };

  useEffect(() => {
    fetchBagList();
  }, []);

  // fetch rosbag messages for selected bag
  const fetchBagMessages = async (bagName) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/rosbags/${bagName}`);
      if (!response.ok) throw new Error("Failed to fetch rosbag messages");
      const data = await response.json();
      setBagMessages(data.rosbag_json || data);
    } catch (err) {
      console.error("Error fetching bag data:", err);
      setError("Unable to load rosbag messages.");
      setBagMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  // handle visualize button click
  const handleVisualize = () => {
    if (!selectedCsv) return;

    const iframe = document.querySelector("iframe[title='Run Data Analysis']");
    if (!iframe) return;

    setIsLoading(true);
    iframe.src = ""; // force clear

    setTimeout(() => {
      iframe.src = EV_URL;

      iframe.onload = () => {
        setIsLoading(false);
        console.log("Sending CSV name to Shiny:", selectedCsv.value);

        // Extract only the origin (scheme + host + port)
        const shinyOrigin = new URL(EV_URL).origin;
        console.log("iframe origin:", iframe.src);

        iframe.contentWindow.postMessage(
          { type: "load_csv", csv: selectedCsv.value },
          shinyOrigin
        );

        // fallback if Shiny not ready yet
        iframe.contentWindow.postMessage(
          { type: "load_csv", csv: selectedCsv.value },
          "*"
        );
      };
    }, 150);
  };

  return (
    <div className="parent">
      <div className="left-pane">
        {/* CSV Upload Section */}
        <h3 style={{ color: "white", marginBottom: "12px" }}>
          CSV Upload & Visualization
        </h3>

        <UploadCsv
          onUploadComplete={() => {
            fetchCsvList();
          }}
          loading={setIsLoading}
        />

        <Select
          options={csvList}
          value={selectedCsv}
          onChange={setSelectedCsv}
          isDisabled={isLoading}
          placeholder="Select a CSV file"
          styles={{
            container: (base) => ({ ...base, marginTop: "10px" }),
          }}
        />

        <button
          onClick={handleVisualize}
          className="button-css"
          disabled={!selectedCsv || isLoading}
        >
          {isLoading ? "Loading..." : "Fetch & Visualize CSV"}
        </button>

        {/* ROSBag Section */}
        <h3 style={{ color: "white", margin: "20px 0 12px 0" }}>
          ROSBag Visualization
        </h3>

        <Select
          options={bagList}
          value={selectedBag}
          onChange={setSelectedBag}
          isDisabled={isLoading}
          placeholder="Select a ROSBag"
        />

        <button
          onClick={() => selectedBag && fetchBagMessages(selectedBag.value)}
          className="button-css"
          disabled={!selectedBag || isLoading}
        >
          Fetch Data
        </button>

        {isLoading && <div className="spinner" />}
        {error && (
          <div
            className="error-text"
            style={{ color: "red", marginTop: "10px" }}
          >
            {error}
          </div>
        )}
      </div>

      <div className="right-pane">
        <iframe
          title="Run Data Analysis"
          src={EV_URL}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            background: "#fff",
          }}
        />
      </div>
    </div>
  );
}
