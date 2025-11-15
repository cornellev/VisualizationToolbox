import React, { useRef } from "react";
import "./UploadBag.css"; // Reuse the same CSS for consistent styling

const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");

function UploadCSV({ onUploadComplete, loading }) {
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    loading(true);
    try {
      const file = e.target.files[0];
      if (!file) {
        loading(false);
        alert("No CSV file selected!");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      console.log("Uploading CSV file:", file.name);

      const response = await fetch(`${API_BASE}/upload-csv`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("CSV upload failed");
      const data = await response.json();

      console.log("CSV upload response:", data);
      onUploadComplete(data.name); // callback to parent
      alert(`Uploaded ${file.name} successfully!`);
    } catch (err) {
      console.error("Error uploading CSV:", err);
      alert("Failed to upload CSV. Check console for details.");
    } finally {
      loading(false);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current.click();
  };

  return (
    <div>
      <button onClick={handleButtonClick} className="upload-button">
        Upload CSV
      </button>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileUpload}
        accept=".csv"
      />
    </div>
  );
}

export default UploadCSV;
