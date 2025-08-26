import React, { useRef } from "react";
import "./UploadBag.css";

function UploadBag({ onUploadComplete, loading }) {
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    loading(true);
    try {
      const files = e.target.files;
      if (!files.length) {
        loading(false);
        alert("No files selected!");
        return;
      }
      const formData = new FormData();
      const firstPath = files[0].webkitRelativePath;

      for (const file of files) {
        formData.append("files", file);

        console.log("Uploading file:", file);
      }

      const response = await fetch("http://localhost:5000/upload-folder", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      onUploadComplete(data.folderName);
    } catch (err) {
      console.error("Error uploading files:", err);
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
        Upload ROSBag
      </button>
      <input
        type="file"
        name="files"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileUpload}
        accept=".bag,.db3"
        webkitdirectory="true"
        directory=""
        multiple
      />
    </div>
  );
}

export default UploadBag;
