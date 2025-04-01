import { useState, useEffect } from "react";
import * as faceapi from "face-api.js";

const useFaceApiModels = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = "/models";
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        console.log("Models loaded");
        setLoading(false);
      } catch (err) {
        console.error("Error loading face-api models:", err);
        setError(err);
        setLoading(false);
      }
    };

    loadModels();
  }, []);

  return { loading, error, faceapi };
};

export default useFaceApiModels;
