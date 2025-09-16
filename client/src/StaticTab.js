import React from "react";

const EV_URL = `http://localhost:8000/ev/`;

export default function StaticTab() {
  return (
    <div style={{ height: "70vh", width: "100%" }}>
      <iframe
        title="Run Data Analysis"
        src={EV_URL}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          borderRadius: 8,
          boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
          background: "#fff",
        }}
      />
    </div>
  );
}