import React, { useEffect, useState } from "react";
import Select from "react-select";

const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
const EV_URL = process.env.REACT_APP_EV_URL || "http://localhost:8000/ev/";

export default function StaticTab() {
  const [bagList, setBagList] = useState([]);
  const [selectedBag, setSelectedBag] = useState(null);
  const [bagMessages, setBagMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBagList = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/rosbags`);
        const data = await response.json();
        setBagList(data.map((bag) => ({
          label: bag.folder_name,
          value: bag.folder_name,
        })));
      } catch (err) {
        console.error("Failed to fetch bag list:", err);
      }
    };
    fetchBagList();
  }, []);

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

  const iframeSrc = selectedBag
    ? `${EV_URL}?bag=${encodeURIComponent(selectedBag.value)}`
    : EV_URL;

  return (
    <div className="parent">
      <div className="left-pane">
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
        {error && <div className="error-text">{error}</div>}
      </div>

      <div className="right-pane">
        <iframe
          title="Run Data Analysis"
          src={iframeSrc}
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
