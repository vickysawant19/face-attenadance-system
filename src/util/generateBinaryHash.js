export const generateBinaryHash = (descriptor) =>
  descriptor
    .map((val) => (val > 0 ? "1" : "0"))
    .join("")
    .substring(0, 128);
