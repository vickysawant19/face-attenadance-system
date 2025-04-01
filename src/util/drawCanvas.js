export const drawCanvas = async ({
  webcamRef,
  canvasRef,
  faceapi,
  attemptMatch,
  setResultMessage,
}) => {
  if (
    webcamRef.current?.video &&
    canvasRef.current &&
    webcamRef.current.video.readyState === 4
  ) {
    const video = webcamRef.current.video;
    const detection = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detection) {
      const resized = faceapi.resizeResults(detection, {
        width: video.videoWidth,
        height: video.videoHeight,
      });
      faceapi.draw.drawDetections(canvas, resized);
      if (attemptMatch) {
        const match = await attemptMatch(detection);
        if (match && match.name) {
          // Draw a card overlay on the detection box
          const { x, y, width } = resized.detection.box;
          const cardWidth = width;
          const cardHeight = 30;
          ctx.fillStyle = "rgba(0, 0, 255, 0.7)";
          ctx.fillRect(x, y - cardHeight, cardWidth, cardHeight);
          ctx.fillStyle = "#fff";
          ctx.font = "16px Arial";
          ctx.fillText(match.name, x + 5, y - 8);
          setResultMessage(
            `Match found: ${match.name} (distance: ${match.distance.toFixed(
              2
            )})`
          );
        } else {
          setResultMessage("No match found.");
        }
      }
    } else {
      setResultMessage("No face detected.");
    }
  }
};
