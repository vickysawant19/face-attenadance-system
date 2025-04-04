import { Query } from "appwrite";

export const generateHashArray = (hash) => {
  return (hash.match(/.{1,20}/g) || []).slice(0, 3);
};

export const generateBinaryHash = (descriptor) =>
  descriptor
    .map((val) => (val > 0 ? "1" : "0"))
    .join("")
    .substring(0, 128);

export const generateHashQuery = (hashArray) =>
  Query.or(hashArray.map((hash) => Query.contains("hash", hash)));
