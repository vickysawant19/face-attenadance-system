import { Query } from "appwrite";
import { useEffect, useRef, useState } from "react";
import { appwriteService } from "./appwrite/appwriteService";
import { drawCanvas } from "./util/drawCanvas";
import { generateBinaryHash } from "./util/generateBinaryHash";

const MatchFaceMode = ({ faceapi, webcamRef, canvasRef }) => {
  const [resultMessage, setResultMessage] = useState("");
  //cache the face detection
  const [faceCache, setFaceCache] = useState(new Map());
  // Ref to track if an API call is currently in progress
  const apiCallInProgressRef = useRef(false);
  // Use a ref to access the latest faceCache without re-rendering
  const faceCacheRef = useRef(new Map());

  // Update the ref whenever faceCache state changes
  useEffect(() => {
    faceCacheRef.current = faceCache;
  }, [faceCache]);

  // Helper: Given a detection and a list of documents, find a matching document
  const matchWithDocuments = (detection, documents) => {
    const threshold = 0.4;
    let matchFound = null;
    for (const doc of documents) {
      if (!doc.descriptor || !Array.isArray(doc.descriptor)) continue;
      const storedDescriptors = doc.descriptor
        .map((desc) => {
          try {
            return Object.values(JSON.parse(desc));
          } catch (e) {
            console.error("Error parsing descriptor:", e);
            return null;
          }
        })
        .filter((d) => d);
      for (const storedDesc of storedDescriptors) {
        if (detection.descriptor.length !== storedDesc.length) continue;
        const distance = faceapi.euclideanDistance(
          detection.descriptor,
          storedDesc
        );
        if (distance < threshold) {
          matchFound = {
            name: doc.name,
            distance,
            document: doc, // Store the entire document for reference
          };
          break;
        }
      }
      if (matchFound) break;
    }
    return matchFound;
  };

  // Helper function to compare face descriptors
  const compareDescriptors = (descriptor1, descriptor2) => {
    if (
      !descriptor1 ||
      !descriptor2 ||
      descriptor1.length !== descriptor2.length
    ) {
      return 1.0; // Return a value greater than any threshold if descriptors can't be compared
    }
    return faceapi.euclideanDistance(descriptor1, descriptor2);
  };

  // This function attempts a match, first checking the local dbCache.
  // It will not call the API if the last call is still in progress.
  const attemptMatch = async (detection) => {
    const detectedHash = generateBinaryHash(detection.descriptor);
    // Create an array of hash chunks (3 chunks of 20 bits each)
    const hashArray = (detectedHash.match(/.{1,16}/g) || []).slice(0, 3);

    let cacheFace = null;
    // Use faceCacheRef instead of faceCache state
    const currentFaceCache = faceCacheRef.current;
    console.log("Total keys in cache:", currentFaceCache.size);

    // Check if the face is already present in the cache
    // First check for exact hash match
    if (currentFaceCache.has(detectedHash)) {
      console.log("Exact face hash found in cache");
      cacheFace = currentFaceCache.get(detectedHash);

      // If the entry is marked as not matched, perform a descriptor comparison
      if (cacheFace && !cacheFace.isMatched && cacheFace.descriptor) {
        console.log(
          "Found cache face but isMatched=false, checking descriptors"
        );

        // Check if this new face can match with cached documents
        const bestDocMatch = findBestDescriptorMatch(
          detection.descriptor,
          cacheFace
        );

        if (bestDocMatch) {
          console.log(
            "Secondary descriptor match found with:",
            bestDocMatch.name
          );

          // Update the cache entry with the match information
          const updatedData = {
            ...cacheFace,
            isMatched: true,
            message: {
              name: bestDocMatch.name,
              distance: bestDocMatch.distance,
              document: bestDocMatch.document,
              matchSource: "secondary_descriptor_check",
            },
          };

          // Update both the cache map and the state
          const newCache = new Map(currentFaceCache);
          newCache.set(detectedHash, updatedData);

          // Update state and ref
          setFaceCache(newCache);
          faceCacheRef.current = newCache;

          return updatedData.message;
        }
      }
    } else {
      // Then check for partial matches using hash chunks
      for (const faceHash of currentFaceCache.keys()) {
        if (hashArray.some((hash) => faceHash.includes(hash))) {
          console.log("Partial face hash match found in cache");
          cacheFace = currentFaceCache.get(faceHash);

          // If the entry is marked as not matched, perform a descriptor comparison
          if (cacheFace && !cacheFace.isMatched && cacheFace.descriptor) {
            console.log(
              "Found cache face but isMatched=false, checking descriptors"
            );

            // Check if this new face can match with cached documents
            const bestDocMatch = findBestDescriptorMatch(
              detection.descriptor,
              cacheFace
            );

            if (bestDocMatch) {
              console.log(
                "Secondary descriptor match found with:",
                bestDocMatch.name
              );

              // Update the cache entry with the match information
              const updatedData = {
                ...cacheFace,
                isMatched: true,
                message: {
                  name: bestDocMatch.name,
                  distance: bestDocMatch.distance,
                  document: bestDocMatch.document,
                  matchSource: "secondary_descriptor_check",
                },
              };

              // Update both the cache map and the state
              const newCache = new Map(currentFaceCache);
              newCache.set(faceHash, updatedData);

              // Also add an entry for the new hash
              newCache.set(detectedHash, updatedData);

              // Update state and ref
              setFaceCache(newCache);
              faceCacheRef.current = newCache;

              return updatedData.message;
            }
          }

          break;
        }
      }
    }

    if (cacheFace) {
      console.log(
        "Returning cached face data for:",
        cacheFace.message?.name || "Unknown"
      );
      return cacheFace.message;
    }

    console.log("No matching cached response; preparing to query DB");

    // Don't call API if a call is already in progress.
    if (apiCallInProgressRef.current) {
      console.log("API call already in progress; skipping this attempt");
      return null;
    }

    // Mark API call as in progress.
    apiCallInProgressRef.current = true;
    // Build query from hash chunks
    const queries = hashArray.map((chunk) => Query.contains("hash", chunk));
    try {
      const response = await appwriteService.getMatches([Query.or(queries)]);

      if (response.total) {
        const matchFound = matchWithDocuments(detection, response.documents);

        if (matchFound) {
          console.log("Match found for:", matchFound.name);

          // Store all documents with their hashes
          const newCache = new Map(currentFaceCache);

          // 1. Store the detected face hash with the match info
          const data = {
            detection,
            detectedHash,
            isMatched: true,
            attendanceMarked: false, // Add attendance flag (default to false)
            message: {
              name: matchFound.name,
              distance: matchFound.distance,
              document: matchFound.document, // Store the whole document
            },
            descriptor: detection.descriptor, // Store the face descriptor
          };
          newCache.set(detectedHash, data);

          // 2. Store all document hashes from the response
          response.documents.forEach((doc) => {
            // For each document in the response
            if (doc.hash && Array.isArray(doc.hash)) {
              doc.hash.forEach((hashKey) => {
                // Only set if this hash isn't already in cache or if it's for the matched person
                if (!newCache.has(hashKey) || doc.name === matchFound.name) {
                  newCache.set(hashKey, {
                    ...data, // Copy the data object
                    documentHash: hashKey, // Add the source hash
                  });
                }
              });
            }
          });

          // Update both state and ref
          setFaceCache(newCache);
          faceCacheRef.current = newCache;

          return matchFound;
        } else {
          // No match was found despite getting documents from DB
          console.log(
            "Documents found but no face match - storing documents for later comparison"
          );

          const newCache = new Map(currentFaceCache);

          // Store the detected face with the documents info for potential future matching
          const data = {
            detection,
            detectedHash,
            isMatched: false,
            attendanceMarked: false,
            message: {
              name: "Unknown",
              distance: 0,
              possibleMatches: response.documents.map((doc) => ({
                name: doc.name,
                hash: doc.hash,
                // Store the parsed descriptors for future matching
                descriptors: doc.descriptor
                  ? doc.descriptor
                      .map((desc) => {
                        try {
                          return Object.values(JSON.parse(desc));
                        } catch (e) {
                          return null;
                        }
                      })
                      .filter((d) => d)
                  : [],
              })),
            },
            descriptor: detection.descriptor, // Store current face descriptor
            documents: response.documents, // Store all found documents
          };

          newCache.set(detectedHash, data);

          // Also store associations with all document hashes for potential future lookups
          response.documents.forEach((doc) => {
            if (doc.hash && Array.isArray(doc.hash)) {
              doc.hash.forEach((hashKey) => {
                if (!newCache.has(hashKey)) {
                  newCache.set(hashKey, {
                    ...data,
                    documentHash: hashKey,
                    sourceName: doc.name, // Store the name from the document
                  });
                }
              });
            }
          });

          // Update both state and ref
          setFaceCache(newCache);
          faceCacheRef.current = newCache;

          return {
            name: "Unknown",
            distance: 0,
            possibleMatches: response.documents.map((doc) => doc.name),
          };
        }
      } else {
        // No documents found in DB
        console.log("No documents found in database - storing as unknown");

        const data = {
          detection,
          detectedHash,
          isMatched: false,
          attendanceMarked: false,
          message: { name: "Unknown", distance: 0 },
          descriptor: detection.descriptor, // Store the descriptor anyway
        };

        const newCache = new Map(currentFaceCache);
        newCache.set(detectedHash, data);
        setFaceCache(newCache);
        faceCacheRef.current = newCache;

        return { name: "Unknown", distance: 0 };
      }
    } catch (error) {
      console.error("Error matching face:", error);
      return null;
    } finally {
      // Reset the API call flag once the call is complete.
      apiCallInProgressRef.current = false;
    }
  };

  // Helper function to find the best descriptor match from cached documents
  const findBestDescriptorMatch = (descriptor, cachedFace) => {
    const threshold = 0.4;
    let bestMatch = null;
    let lowestDistance = threshold;

    // If no documents, we can't find a match
    if (!cachedFace.documents || !Array.isArray(cachedFace.documents)) {
      return null;
    }

    // Check against each document and its descriptors
    for (const doc of cachedFace.documents) {
      if (!doc.descriptor || !Array.isArray(doc.descriptor)) continue;

      const docDescriptors = doc.descriptor
        .map((desc) => {
          try {
            return Object.values(JSON.parse(desc));
          } catch (e) {
            console.error("Error parsing descriptor:", e);
            return null;
          }
        })
        .filter((d) => d);

      for (const docDesc of docDescriptors) {
        if (descriptor.length !== docDesc.length) continue;

        const distance = faceapi.euclideanDistance(descriptor, docDesc);
        if (distance < lowestDistance) {
          lowestDistance = distance;
          bestMatch = {
            name: doc.name,
            distance,
            document: doc,
          };
        }
      }
    }

    return bestMatch;
  };

  // Function to mark attendance (you can call this when needed)
  const markAttendance = (faceHash) => {
    if (faceCacheRef.current.has(faceHash)) {
      const newCache = new Map(faceCacheRef.current);
      const faceData = newCache.get(faceHash);

      // Update the attendance field
      faceData.attendanceMarked = true;
      newCache.set(faceHash, faceData);

      // Update both state and ref
      setFaceCache(newCache);
      faceCacheRef.current = newCache;

      return true;
    }
    return false;
  };

  // Overlay logic: detect face and, if matched, draw a card with the student name.
  useEffect(() => {
    let IntervalId;

    // Update overlay every 500ms
    IntervalId = setInterval(async () => {
      await drawCanvas({
        webcamRef,
        canvasRef,
        faceapi,
        attemptMatch,
        setResultMessage,
      });
    }, 500);

    return () => {
      clearInterval(IntervalId);
    };
  }, [webcamRef, canvasRef, faceCache]); // Added faceCache as a dependency

  return (
    <div className="controls match-face">
      <h2>Match Face</h2>
      {resultMessage && <p className="result-message">{resultMessage}</p>}
      <h2>Total Face Cache: {faceCache.size}</h2>
    </div>
  );
};

export default MatchFaceMode;
