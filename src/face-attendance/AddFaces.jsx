import { useEffect, useState } from "react";
import { appwriteService } from "../appwrite/appwriteService";
import { drawCanvas } from "../util/drawCanvas";
import { generateBinaryHash } from "../util/generateBinaryHash";

const AddFaceMode = ({ faceapi, webcamRef, canvasRef }) => {
  const [samples, setSamples] = useState([]);
  const [registrationName, setRegistrationName] = useState("");
  const [resultMessage, setResultMessage] = useState("");

  // Capture face sample from video
  const captureFace = async () => {
    if (
      webcamRef.current &&
      webcamRef.current.video &&
      webcamRef.current.video.readyState === 4
    ) {
      const video = webcamRef.current.video;
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
      return detection;
    }
    return null;
  };

  const handleAddFace = async () => {
    setResultMessage("");
    const detection = await captureFace();
    if (detection) {
      setSamples((prev) => [...prev, detection.descriptor]);
      setResultMessage(
        `Face sample added. Total samples: ${samples.length + 1}/5`
      );
    } else {
      setResultMessage("No face detected. Please try again.");
    }
  };

  const handleSaveRegistration = async () => {
    setResultMessage("");
    if (!registrationName.trim()) {
      setResultMessage("Please enter a unique name.");
      return;
    }
    if (samples.length !== 5) {
      setResultMessage("Please add exactly 5 face samples before saving.");
      return;
    }
    try {
      const hashes = samples.map(generateBinaryHash);
      const stringDescriptors = samples.map((sample) => JSON.stringify(sample));

      await appwriteService.storeFaces({
        name: registrationName.trim(),
        hash: hashes,
        descriptor: stringDescriptors,
      });
      setResultMessage("Face registered successfully!");
      // Reset the fields
      setSamples([]);
      setRegistrationName("");
    } catch (error) {
      console.error("Error saving face data:", error);
      setResultMessage("Error saving face data. Please try again.");
    }
  };

  useEffect(() => {
    let intervalId;

    intervalId = setInterval(
      () => drawCanvas({ webcamRef, canvasRef, faceapi, setResultMessage }),
      500
    );
    return () => clearInterval(intervalId);
  }, [webcamRef, canvasRef]);

  return (
    <div className="controls add-face">
      <h2>Add Face</h2>
      <input
        type="text"
        className="input"
        placeholder="Enter unique name"
        value={registrationName}
        onChange={(e) => setRegistrationName(e.target.value)}
      />
      <div>Face Samples: {samples.length} / 5</div>
      <button
        className="button"
        onClick={handleAddFace}
        disabled={samples.length >= 5}
      >
        Add Face
      </button>
      {samples.length === 5 && (
        <button className="button" onClick={handleSaveRegistration}>
          Save Registration
        </button>
      )}
      {resultMessage && <p className="result-message">{resultMessage}</p>}
    </div>
  );
};

export default AddFaceMode;
