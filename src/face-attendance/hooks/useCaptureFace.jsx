import { useState, useCallback } from "react";

const useCaptureFace = ({ faceapi, webcamRef, canvasRef }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [faceDetected, setFaceDetected] = useState(false);

  // Capture face sample from video
  const captureFace = useCallback(async () => {
    if (!webcamRef?.current?.video?.readyState === 4) {
      setError("Webcam not ready");
      return null;
    }

    try {
      setIsLoading(true);
      setError("");

      const video = webcamRef.current.video;

      // Detect face with landmarks and descriptor
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        setFaceDetected(true);

        // Draw detection on canvas if provided
        if (canvasRef?.current) {
          const displaySize = {
            width: webcamRef.current.video.videoWidth,
            height: webcamRef.current.video.videoHeight,
          };

          faceapi.matchDimensions(canvasRef.current, displaySize);

          const resizedDetections = faceapi.resizeResults(
            detection,
            displaySize
          );

          // Clear previous drawings
          const ctx = canvasRef.current.getContext("2d");
          ctx.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );

          // Draw detection results
          faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
          faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedDetections);
        }

        return detection;
      } else {
        setFaceDetected(false);

        // Clear canvas if no face detected
        if (canvasRef?.current) {
          const ctx = canvasRef.current.getContext("2d");
          ctx.clearRect(
            0,
            0,
            canvasRef.current.width,
            canvasRef.current.height
          );
        }

        setError("No face detected");
        return null;
      }
    } catch (err) {
      console.log(err);
      setError(`Face capture failed: ${err.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [faceapi, webcamRef, canvasRef]);

  return {
    captureFace,
    isLoading,
    error,
    faceDetected,
  };
};

export default useCaptureFace;
