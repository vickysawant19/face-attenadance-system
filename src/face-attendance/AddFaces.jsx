import { useEffect, useState } from "react";
import { appwriteService } from "../appwrite/appwriteService";
import { drawCanvas } from "../util/drawCanvas";
import { generateBinaryHash } from "../util/generateBinaryHash";
import useCaptureFace from "./hooks/useCaptureFace";
import { generateHashArray, generateHashQuery } from "../util/hash";
import { Query } from "appwrite";

const AddFaceMode = ({ faceapi, webcamRef, canvasRef }) => {
  const [samples, setSamples] = useState([]);
  const [registrationName, setRegistrationName] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const { captureFace, error, faceDetected, isLoading } = useCaptureFace({
    faceapi,
    webcamRef,
    canvasRef,
  });

  // Check if face hash already exists in database
  const checkFaceExists = async (hash) => {
    const hashArray = generateHashArray(hash);

    const query = generateHashQuery(hashArray);

    try {
      const existingFaces = await appwriteService.getMatches([
        query,
        Query.limit(1),
        Query.select("name"),
      ]);

      return existingFaces.documents.length > 0;
    } catch (error) {
      console.error("Error checking face existence:", error);
      return false;
    }
  };

  const handleAddFace = async () => {
    setResultMessage("");
    setIsVerifying(true);

    try {
      const detection = await captureFace();

      if (!detection) {
        setResultMessage("No face detected. Please try again.");
        setIsVerifying(false);
        return;
      }

      // Generate hash for the captured face
      const hash = generateBinaryHash(detection.descriptor);

      // Check if this face already exists
      const faceExists = await checkFaceExists(hash);

      if (faceExists) {
        setResultMessage(
          "This face is already registered in the system. Try a different angle."
        );
        setIsVerifying(false);
        return;
      }

      // Face not in database, add to samples
      setSamples((prev) => [
        ...prev,
        {
          descriptor: detection.descriptor,
          hash: hash,
        },
      ]);

      setResultMessage(
        `Face sample added. Total samples: ${samples.length + 1}/5`
      );
    } catch (error) {
      console.error("Error processing face:", error);
      setResultMessage("Error processing face. Please try again.");
    } finally {
      setIsVerifying(false);
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
      // Extract hashes and descriptors from samples
      const hashes = samples.map((sample) => sample.hash);
      const stringDescriptors = samples.map((sample) =>
        JSON.stringify(sample.descriptor)
      );

      // Check if name already exists
      const nameExists = await appwriteService.getMatches([
        Query.equal("name", registrationName),
        Query.limit(1),
      ]);
      if (nameExists.documents.length > 0) {
        setResultMessage(
          "This name is already registered. Please use a different name."
        );
        return;
      }

      // Store face data in Appwrite
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
  }, [webcamRef, canvasRef, faceapi]);

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
        disabled={samples.length >= 5 || isVerifying}
      >
        {isVerifying ? "Verifying..." : "Add Face"}
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
