import { Query } from "appwrite";
import { useEffect, useRef, useState } from "react";
import { appwriteService } from "../appwrite/appwriteService";
import { drawCanvas } from "../util/drawCanvas";
import { generateBinaryHash } from "../util/generateBinaryHash";

const MatchFaceMode = ({ faceapi, webcamRef, canvasRef }) => {
  const [resultMessage, setResultMessage] = useState("");
  // Cache for detected faces
  const [faceCache, setFaceCache] = useState(new Map());
  // New cache for database responses
  const [dbResponseCache, setDbResponseCache] = useState(new Map());
  // Ref to track if an API call is currently in progress
  const apiCallInProgressRef = useRef(false);
  // Use refs to access the latest cache values without re-rendering
  const faceCacheRef = useRef(new Map());
  const dbResponseCacheRef = useRef(new Map());

  // Update the refs whenever cache states change
  useEffect(() => {
    faceCacheRef.current = faceCache;
  }, [faceCache]);

  useEffect(() => {
    dbResponseCacheRef.current = dbResponseCache;
  }, [dbResponseCache]);

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

  // Check if face is in DB response cache
  const checkDbCache = (hashArray) => {
    const currentDbCache = dbResponseCacheRef.current;
    console.log("Checking DB cache with hash chunks:", hashArray);

    // Check if any hash chunk is present in the DB cache
    for (const hash of hashArray) {
      if (currentDbCache.has(hash)) {
        console.log("DB cache hit for hash chunk:", hash);
        return currentDbCache.get(hash);
      }
    }

    console.log("No match found in DB cache");
    return null;
  };

  // Store documents in DB cache
  const storeInDbCache = (documents) => {
    if (!documents || !Array.isArray(documents) || documents.length === 0)
      return;

    console.log(`Storing ${documents.length} documents in DB cache`);
    const currentDbCache = new Map(dbResponseCacheRef.current);

    documents.forEach((doc) => {
      if (doc.hash && Array.isArray(doc.hash)) {
        // For each hash in the document, store the entire document list
        doc.hash.forEach((hashKey) => {
          currentDbCache.set(hashKey, documents);
        });
        console.log(
          `Cached document "${doc.name}" with ${doc.hash.length} hash entries`
        );
      }
    });

    // Update both state and ref
    setDbResponseCache(currentDbCache);
    dbResponseCacheRef.current = currentDbCache;
  };

  // This function attempts a match, first checking the local face cache,
  // then the DB response cache, and finally calling the API if needed.
  const attemptMatch = async (detection) => {
    const detectedHash = generateBinaryHash(detection.descriptor);
    // Create an array of hash chunks (3 chunks of 20 bits each)
    const hashArray = (detectedHash.match(/.{1,20}/g) || []).slice(0, 3);

    // STEP 1: Check if the face is already in the face cache
    const currentFaceCache = faceCacheRef.current;
    console.log("Total keys in face cache:", currentFaceCache.size);

    let cacheFace = null;

    // Check if the face is already present in the face cache
    for (const faceHash of currentFaceCache.keys()) {
      if (hashArray.some((hash) => faceHash.includes(hash))) {
        console.log("Face hash match found in face cache");
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

    if (cacheFace) {
      console.log(
        "Returning cached face data for:",
        cacheFace.message?.name || "Unknown"
      );
      return cacheFace.message;
    }

    console.log("No match in face cache, checking DB cache");

    // STEP 2: Check if we have matching documents in the DB cache
    const cachedDocuments = checkDbCache(hashArray);

    if (cachedDocuments) {
      console.log(
        `Found ${cachedDocuments.length} documents in DB cache, attempting to match`
      );
      const matchFound = matchWithDocuments(detection, cachedDocuments);

      if (matchFound) {
        console.log("Match found in DB cache for:", matchFound.name);

        // Store the match in face cache
        const newFaceCache = new Map(currentFaceCache);
        const data = {
          detection,
          detectedHash,
          isMatched: true,
          attendanceMarked: false,
          message: {
            name: matchFound.name,
            distance: matchFound.distance,
            document: matchFound.document,
            matchSource: "db_cache",
          },
          descriptor: detection.descriptor,
        };

        newFaceCache.set(detectedHash, data);
        setFaceCache(newFaceCache);
        faceCacheRef.current = newFaceCache;

        return matchFound;
      } else {
        console.log("Documents found in DB cache but no face match");

        // Store the detected face with the documents for potential future matching
        const newFaceCache = new Map(currentFaceCache);
        const data = {
          detection,
          detectedHash,
          isMatched: false,
          attendanceMarked: false,
          message: {
            name: "Unknown",
            distance: 0,
            possibleMatches: cachedDocuments.map((doc) => doc.name),
          },
          descriptor: detection.descriptor,
          documents: cachedDocuments,
        };

        newFaceCache.set(detectedHash, data);
        setFaceCache(newFaceCache);
        faceCacheRef.current = newFaceCache;

        return { name: "Unknown", distance: 0 };
      }
    }

    console.log(
      "No matching documents in DB cache; preparing to query database"
    );

    // STEP 3: Don't call API if a call is already in progress
    if (apiCallInProgressRef.current) {
      console.log("API call already in progress; skipping this attempt");
      return null;
    }

    // Mark API call as in progress
    apiCallInProgressRef.current = true;

    // Build query from hash chunks
    const queries = hashArray.map((chunk) => Query.contains("hash", chunk));
    try {
      const response = await appwriteService.getMatches([
        Query.or(queries),
        Query.limit(10), // Increased limit to get more potential matches
      ]);

      if (response.total) {
        // Store all documents in DB cache for future use
        storeInDbCache(response.documents);

        const matchFound = matchWithDocuments(detection, response.documents);

        if (matchFound) {
          console.log("Match found from API for:", matchFound.name);

          // Store the match in face cache
          const newFaceCache = new Map(currentFaceCache);
          const data = {
            detection,
            detectedHash,
            isMatched: true,
            attendanceMarked: false,
            message: {
              name: matchFound.name,
              distance: matchFound.distance,
              document: matchFound.document,
              matchSource: "api_call",
            },
            descriptor: detection.descriptor,
          };

          newFaceCache.set(detectedHash, data);

          // Also store all document hashes from the response in face cache
          response.documents.forEach((doc) => {
            if (doc.hash && Array.isArray(doc.hash)) {
              doc.hash.forEach((hashKey) => {
                if (
                  !newFaceCache.has(hashKey) ||
                  doc.name === matchFound.name
                ) {
                  newFaceCache.set(hashKey, {
                    ...data,
                    documentHash: hashKey,
                  });
                }
              });
            }
          });

          setFaceCache(newFaceCache);
          faceCacheRef.current = newFaceCache;

          return matchFound;
        } else {
          // No match was found despite getting documents from DB
          console.log("Documents found from API but no face match");

          const newFaceCache = new Map(currentFaceCache);
          const data = {
            detection,
            detectedHash,
            isMatched: false,
            attendanceMarked: false,
            message: {
              name: "Unknown",
              distance: 0,
              possibleMatches: response.documents.map((doc) => doc.name),
            },
            descriptor: detection.descriptor,
            documents: response.documents,
          };

          newFaceCache.set(detectedHash, data);

          // Also store associations with all document hashes
          response.documents.forEach((doc) => {
            if (doc.hash && Array.isArray(doc.hash)) {
              doc.hash.forEach((hashKey) => {
                if (!newFaceCache.has(hashKey)) {
                  newFaceCache.set(hashKey, {
                    ...data,
                    documentHash: hashKey,
                    sourceName: doc.name,
                  });
                }
              });
            }
          });

          setFaceCache(newFaceCache);
          faceCacheRef.current = newFaceCache;

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
          descriptor: detection.descriptor,
        };

        const newFaceCache = new Map(currentFaceCache);
        newFaceCache.set(detectedHash, data);
        setFaceCache(newFaceCache);
        faceCacheRef.current = newFaceCache;

        return { name: "Unknown", distance: 0 };
      }
    } catch (error) {
      console.error("Error matching face:", error);
      return null;
    } finally {
      // Reset the API call flag once the call is complete
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
      <h2>Face Cache: {faceCache.size}</h2>
      <h2>DB Cache: {dbResponseCache.size}</h2>
    </div>
  );
};

export default MatchFaceMode;
