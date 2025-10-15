import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  NavLink,
  Navigate,
} from "react-router-dom";
import DynamicTab from "./DynamicTab";
import StaticTab from "./StaticTab";
import "./App.css";

export default function App() {
  return (
    <Router>
      <div className="App">
        <div className="tabs" style={{ marginBottom: 12 }}>
          <NavLink
            to="/dynamic"
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >
            Dynamic
          </NavLink>
          <NavLink
            to="/static"
            className={({ isActive }) => `tab${isActive ? " active" : ""}`}
          >
            Static
          </NavLink>
        </div>

        <Routes>
          <Route path="/" element={<Navigate to="/dynamic" replace />} />
          <Route path="/dynamic" element={<DynamicTab />} />
          <Route path="/static" element={<StaticTab />} />
          {/* default route */}
          <Route path="*" element={<Navigate to="/dynamic" replace />} />
        </Routes>
      </div>
    </Router>
  );
}
