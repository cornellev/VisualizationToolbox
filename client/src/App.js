import React from "react";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import DynamicTab from "./DynamicTab";
import StaticTab from "./StaticTab";

export default function App() {
  return (
    <Router>
      <div className="App">
        <div className="tabs" style={{ marginBottom: 12 }}>
          <Link to="/dynamic" className="tab">
            Dynamic
          </Link>
          <Link to="/static" className="tab">
            Static
          </Link>
        </div>

        <Routes>
          <Route path="/dynamic" element={<DynamicTab />} />
          <Route path="/static" element={<StaticTab />} />
          {/* default route */}
          <Route path="*" element={<DynamicTab />} />
        </Routes>
      </div>
    </Router>
  );
}
