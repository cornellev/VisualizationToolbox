import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Slider from "@mui/material/Slider";
import IconButton from "@mui/material/IconButton";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";

const MAX_RENDERED_POINTS = parseInt(
  process.env.REACT_APP_POINTCLOUD_MAX_POINTS || "120000",
  10
);
const DEFAULT_POINT_COLOR = { r: 0.2, g: 0.8, b: 1 };

const DATATYPE_READERS = {
  1: (view, offset) => view.getInt8(offset),
  2: (view, offset) => view.getUint8(offset),
  3: (view, offset, little) => view.getInt16(offset, little),
  4: (view, offset, little) => view.getUint16(offset, little),
  5: (view, offset, little) => view.getInt32(offset, little),
  6: (view, offset, little) => view.getUint32(offset, little),
  7: (view, offset, little) => view.getFloat32(offset, little),
  8: (view, offset, little) => view.getFloat64(offset, little),
};

const getValue = (obj, key) => {
  if (!obj) return undefined;
  if (obj[key] !== undefined) return obj[key];
  if (obj[`_${key}`] !== undefined) return obj[`_${key}`];
  return undefined;
};

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const toBool = (value, fallback = false) => {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }
  return fallback;
};

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function lerpColor(t) {
  const clamped = clamp(t, 0, 1);
  // simple blue -> cyan -> yellow gradient
  const r = clamped < 0.5 ? clamped * 2 * 0.2 : 0.2 + (clamped - 0.5) * 2 * 0.8;
  const g = clamped < 0.5 ? clamped * 2 * 0.8 : 0.8 + (clamped - 0.5) * 2 * 0.2;
  const b = clamped < 0.5 ? 1 - clamped * 0.5 : 0.5 - (clamped - 0.5) * 0.5;
  return { r: clamp(r), g: clamp(g), b: clamp(b) };
}

function sanitizeField(field) {
  if (!field) return null;
  const name = getValue(field, "name");
  if (!name) return null;
  return {
    name,
    offset: toNumber(getValue(field, "offset"), 0),
    datatype: toNumber(getValue(field, "datatype"), 0),
    count: toNumber(getValue(field, "count"), 1),
  };
}

function getFieldMap(fields = []) {
  const map = {};
  fields.forEach((field) => {
    const cleaned = sanitizeField(field);
    if (!cleaned) return;
    map[cleaned.name.toLowerCase()] = cleaned;
  });
  return map;
}

function normalizePointCloudMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.__normalizedPointCloud) return raw.__normalizedPointCloud;

  const normalized = { ...raw };
  [
    "data",
    "fields",
    "height",
    "width",
    "point_step",
    "row_step",
    "is_bigendian",
    "is_dense",
    "points",
  ].forEach((key) => {
    const value = getValue(raw, key);
    if (value !== undefined) normalized[key] = value;
  });

  raw.__normalizedPointCloud = normalized;
  return normalized;
}

function buildGeometryFromSimplePoints(points = []) {
  if (!points.length) return null;
  const stride = Math.max(1, Math.floor(points.length / MAX_RENDERED_POINTS));
  const sampleCount = Math.min(points.length, Math.ceil(points.length / stride));
  const positions = new Float32Array(sampleCount * 3);
  const colors = new Float32Array(sampleCount * 3);
  let writeIndex = 0;

  for (let i = 0; i < points.length && writeIndex < sampleCount; i += stride) {
    const { x, y, z, r = 255, g = 255, b = 255 } = points[i];
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z)
    ) {
      continue;
    }
    const base = writeIndex * 3;
    positions[base] = x;
    positions[base + 1] = y;
    positions[base + 2] = z;
    colors[base] = r / 255;
    colors[base + 1] = g / 255;
    colors[base + 2] = b / 255;
    writeIndex += 1;
  }

  if (!writeIndex) return null;
  return {
    positions:
      writeIndex * 3 === positions.length
        ? positions
        : positions.slice(0, writeIndex * 3),
    colors:
      writeIndex * 3 === colors.length ? colors : colors.slice(0, writeIndex * 3),
    count: writeIndex,
  };
}

function createDataViewFromMessage(message) {
  if (!message) return null;
  if (message.__dataView) return message.__dataView;

  const dataField = getValue(message, "data");
  let rawBytes = null;

  if (Array.isArray(dataField)) {
    rawBytes = dataField;
  } else if (Array.isArray(dataField?.data)) {
    rawBytes = dataField.data;
  } else if (Array.isArray(dataField?._data)) {
    rawBytes = dataField._data;
  }

  if (!rawBytes || !rawBytes.length) return null;
  const byteArray =
    rawBytes instanceof Uint8Array ? rawBytes : Uint8Array.from(rawBytes);
  const view = new DataView(byteArray.buffer);
  message.__dataView = view;
  message.__byteArray = byteArray;
  return view;
}

function decodePointCloudMessage(rawMessage) {
  const message = normalizePointCloudMessage(rawMessage);
  if (!message) return null;

  if (Array.isArray(message.points)) {
    return buildGeometryFromSimplePoints(message.points);
  }

  const dataView = createDataViewFromMessage(message);
  if (!dataView || !message.point_step) return null;

  const fields = getFieldMap(message.fields);
  const xField = fields.x;
  const yField = fields.y;
  const zField = fields.z;
  if (!xField || !yField || !zField) return null;

  const rgbField = fields.rgb || fields.rgba;
  const intensityField = fields.intensity;
  const littleEndian = !toBool(message.is_bigendian, false);
  const pointStep = toNumber(message.point_step, 0);
  if (!pointStep) return null;
  const byteLength = message.__byteArray?.length || dataView.byteLength;
  const width = toNumber(message.width, 0);
  const height = toNumber(message.height, 0);
  const declaredFromDims = width && height ? width * height : 0;
  const declaredPoints =
    declaredFromDims || Math.floor(byteLength / pointStep);
  const totalPoints = Math.max(0, declaredPoints);
  if (!totalPoints) return null;

  const stride = Math.max(
    1,
    Math.floor(totalPoints / Math.max(MAX_RENDERED_POINTS, 1))
  );
  const sampleCount = Math.min(
    totalPoints,
    Math.ceil(totalPoints / stride)
  );
  const positions = new Float32Array(sampleCount * 3);
  const colors = new Float32Array(sampleCount * 3);
  let writeIndex = 0;

  const decodeFieldValue = (field, base) => {
    const reader = DATATYPE_READERS[field?.datatype];
    if (!reader) return undefined;
    return reader(dataView, base + field.offset, littleEndian);
  };

  for (let i = 0; i < totalPoints && writeIndex < sampleCount; i += stride) {
    const baseOffset = i * pointStep;
    const x = decodeFieldValue(xField, baseOffset);
    const y = decodeFieldValue(yField, baseOffset);
    const z = decodeFieldValue(zField, baseOffset);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z)
    ) {
      continue;
    }

    const posIndex = writeIndex * 3;
    positions[posIndex] = x;
    positions[posIndex + 1] = y;
    positions[posIndex + 2] = z;

    let color = DEFAULT_POINT_COLOR;
    if (rgbField) {
      const rgb = dataView.getUint32(baseOffset + rgbField.offset, littleEndian);
      color = {
        r: ((rgb) & 0xff) / 255,
        g: ((rgb >> 8) & 0xff) / 255,
        b: ((rgb >> 16) & 0xff) / 255,
      };
    } else if (intensityField) {
      const intensity = decodeFieldValue(intensityField, baseOffset);
      const normalized = clamp(intensity / 255);
      color = lerpColor(normalized);
    }

    colors[posIndex] = color.r;
    colors[posIndex + 1] = color.g;
    colors[posIndex + 2] = color.b;
    writeIndex += 1;
  }

  if (!writeIndex) return null;
  const finalPositions =
    writeIndex * 3 === positions.length
      ? positions
      : positions.slice(0, writeIndex * 3);
  const finalColors =
    writeIndex * 3 === colors.length
      ? colors
      : colors.slice(0, writeIndex * 3);

  return {
    positions: finalPositions,
    colors: finalColors,
    count: writeIndex,
  };
}

export default function PointCloudPlayer({ jsonFrames }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const pointsRef = useRef(null);
  const axesRef = useRef(null);
  const pointCacheRef = useRef(new Map());
  const animationFrameRef = useRef(null);

  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pxSize, setPxSize] = useState(0.05);

  const frames = Array.isArray(jsonFrames) ? jsonFrames : [];

  useEffect(() => {
    if (!frames.length) {
      pointCacheRef.current.clear();
    }
  }, [frames.length]);

  useEffect(() => {
    if (frames.length === 0) {
      setCurrentFrame(0);
      setIsPlaying(false);
      return;
    }
    setCurrentFrame((prev) =>
      prev >= frames.length ? frames.length - 1 : prev
    );
  }, [frames.length]);

  // Initialize Three.js scene
  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return () => {};

    while (mountNode.firstChild) {
      mountNode.removeChild(mountNode.firstChild);
    }

    const width = mountNode.clientWidth || mountNode.offsetWidth || 640;
    const height = mountNode.clientHeight || mountNode.offsetHeight || 480;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, width / Math.max(height, 1), 0.1, 2000);
    camera.position.set(0, 0, 30);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    mountNode.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controlsRef.current = controls;

    const axesHelper = new THREE.AxesHelper(10);
    axesRef.current = axesHelper;
    scene.add(axesHelper);

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!rendererRef.current || !cameraRef.current || !mountRef.current) return;
      const newWidth = mountRef.current.clientWidth || 1;
      const newHeight = mountRef.current.clientHeight || 1;
      rendererRef.current.setSize(newWidth, newHeight);
      cameraRef.current.aspect = newWidth / newHeight;
      cameraRef.current.updateProjectionMatrix();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (axesRef.current && sceneRef.current) {
        sceneRef.current.remove(axesRef.current);
        axesRef.current = null;
      }
      if (pointsRef.current && sceneRef.current) {
        sceneRef.current.remove(pointsRef.current);
        pointsRef.current.geometry.dispose();
        pointsRef.current.material.dispose();
        pointsRef.current = null;
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }
      if (rendererRef.current) {
        const domElement = rendererRef.current.domElement;
        rendererRef.current.dispose();
        if (domElement && domElement.parentNode) {
          domElement.parentNode.removeChild(domElement);
        }
        rendererRef.current = null;
      }
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  const getCachedDataset = useCallback(
    (frame, index) => {
      if (!frame) return null;
      const cacheKey = frame.timestamp || `${index}`;
      if (pointCacheRef.current.has(cacheKey)) {
        return pointCacheRef.current.get(cacheKey);
      }

      let dataset = null;
      if (Array.isArray(frame.points)) {
        dataset = buildGeometryFromSimplePoints(frame.points);
      } else if (Array.isArray(frame?.data?.points)) {
        dataset = buildGeometryFromSimplePoints(frame.data.points);
      } else if (frame?.data) {
        dataset = decodePointCloudMessage(frame.data);
      } else if (frame?._data || frame?._fields) {
        dataset = decodePointCloudMessage(frame);
      }

      if (dataset && dataset.count > 0) {
        pointCacheRef.current.set(cacheKey, dataset);
        if (pointCacheRef.current.size > 64) {
          const firstKey = pointCacheRef.current.keys().next().value;
          pointCacheRef.current.delete(firstKey);
        }
      }

      return dataset;
    },
    []
  );

  const currentDataset = useMemo(() => {
    if (!frames.length) return null;
    return getCachedDataset(frames[currentFrame], currentFrame);
  }, [frames, currentFrame, getCachedDataset]);

  // Render the current frame
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (pointsRef.current) {
      scene.remove(pointsRef.current);
      pointsRef.current.geometry.dispose();
      pointsRef.current.material.dispose();
      pointsRef.current = null;
    }

    if (!currentDataset || !currentDataset.count) {
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(currentDataset.positions, 3)
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(currentDataset.colors, 3)
    );

    const material = new THREE.PointsMaterial({
      size: pxSize,
      vertexColors: true,
    });
    const points = new THREE.Points(geometry, material);
    pointsRef.current = points;
    scene.add(points);
  }, [currentDataset, pxSize]);

  // Play/pause logic
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;
    const interval = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % frames.length);
    }, 100); // 100ms per frame, adjust as needed
    return () => clearInterval(interval);
  }, [isPlaying, frames.length]);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        ref={mountRef}
        style={{
          flex: 1,
          width: "100%",
          borderRadius: 8,
          background: "#111",
          minHeight: "55vh",
        }}
      ></div>
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, padding: 8 }}
      >
        <IconButton onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        <Slider
          value={frames.length ? currentFrame : 0}
          min={0}
          max={frames.length ? frames.length - 1 : 0}
          onChange={(e, value) => {
            if (Array.isArray(value)) return;
            setCurrentFrame(value);
          }}
          disabled={!frames.length}
          sx={{ flex: 1, marginLeft: 2 }}
        />
        <Slider
          value={pxSize}
          min={0.01}
          max={0.2}
          step={0.01}
          onChange={(e, value) => {
            if (Array.isArray(value)) return;
            setPxSize(value);
          }}
          sx={{ width: 150, marginLeft: 16 }}
        />
      </div>
    </div>
  );
}
