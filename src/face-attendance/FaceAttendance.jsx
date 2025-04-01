import { useRef, useState } from "react";
import Webcam from "react-webcam";
import AddFaceMode from "./AddFaces";
import useFaceApiModels from "../hooks/useFaceApi";
import MatchFaceMode from "./MatchFaces";

const FaceAttendance = () => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [mode, setMode] = useState("add"); // "add" or "match"

  const { loading, error, faceapi } = useFaceApiModels();

  if (loading) {
    return <div>Loading face detection models...</div>;
  }

  if (error) {
    return <div>Error loading models: {error.message}</div>;
  }

  return (
    <div className="container">
      <button
        className="button"
        onClick={() => setCameraEnabled(!cameraEnabled)}
      >
        {cameraEnabled ? "Disable" : "Enable"} Camera
      </button>
      {cameraEnabled && (
        <div className="webcam-container" style={{ position: "relative" }}>
          <Webcam ref={webcamRef} className="webcam" audio={false} />

          <canvas
            ref={canvasRef}
            className="overlay"
            style={{ position: "absolute", top: 0, left: 0 }}
          />
        </div>
      )}
      {cameraEnabled && (
        <div className="mode-selector">
          <button
            className={`button ${mode === "add" ? "active" : ""}`}
            onClick={() => setMode("add")}
          >
            Add Face
          </button>
          <button
            className={`button ${mode === "match" ? "active" : ""}`}
            onClick={() => setMode("match")}
          >
            Match Face
          </button>
        </div>
      )}
      {cameraEnabled && mode === "add" && (
        <AddFaceMode
          faceapi={faceapi}
          webcamRef={webcamRef}
          canvasRef={canvasRef}
        />
      )}
      {cameraEnabled && mode === "match" && (
        <MatchFaceMode
          faceapi={faceapi}
          webcamRef={webcamRef}
          canvasRef={canvasRef}
        />
      )}
    </div>
  );
};

export default FaceAttendance;
