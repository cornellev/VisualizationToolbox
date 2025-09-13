import React, { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Slider from "@mui/material/Slider";
import IconButton from "@mui/material/IconButton";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";

export default function PointCloudPlayer({ jsonFrames }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const pointsRef = useRef(null);

  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [pxSize, setPxSize] = useState(0.05);

  // Initialize Three.js scene
  useEffect(() => {
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 10);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controlsRef.current = controls;

    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (mountRef.current && rendererRef.current) {
        mountRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, []);

  // Render the current frame
  useEffect(() => {
    if (!jsonFrames || jsonFrames.length === 0) return;

    const scene = sceneRef.current;
    if (!scene) return;

    // Remove previous points
    if (pointsRef.current) {
      scene.remove(pointsRef.current);
      pointsRef.current.geometry.dispose();
      pointsRef.current.material.dispose();
    }

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    const frame = jsonFrames[currentFrame];
    frame.points.forEach((pt) => {
      positions.push(pt.x, pt.y, pt.z);
      colors.push(pt.r / 255, pt.g / 255, pt.b / 255);
    });

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: pxSize,
      vertexColors: true,
    });
    const points = new THREE.Points(geometry, material);
    pointsRef.current = points;
    scene.add(points);
  }, [currentFrame, jsonFrames, pxSize]);

  // Play/pause logic
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % jsonFrames.length);
    }, 100); // 100ms per frame, adjust as needed
    return () => clearInterval(interval);
  }, [isPlaying, jsonFrames]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <div
        ref={mountRef}
        style={{ width: "100%", height: "80%", borderRadius: 8 }}
      ></div>
      <div style={{ display: "flex", alignItems: "center", padding: 8 }}>
        <IconButton onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        <Slider
          value={currentFrame}
          min={0}
          max={jsonFrames ? jsonFrames.length - 1 : 0}
          onChange={(e, value) => setCurrentFrame(value)}
          sx={{ flex: 1, marginLeft: 2 }}
        />
        <Slider
          value={pxSize}
          min={0.01}
          max={0.2}
          step={0.01}
          onChange={(e, value) => setPxSize(value)}
          sx={{ width: 150, marginLeft: 16 }}
        />
      </div>
    </div>
  );
}
