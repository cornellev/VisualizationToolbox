import React from "react";

const EV_URL = `http://localhost:8000/ev/`;

export default function StaticTab() {
  return (
    <div style={{ height: "calc(100vh - 50px)", width: "100%" }}>
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
  );
}
