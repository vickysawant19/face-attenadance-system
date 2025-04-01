import { Client, Databases, ID } from "appwrite";

class AppwriteService {
  constructor() {
    this.client = new Client().setProject("67e55bc5003ad75ad8f0");
    this.database = new Databases(this.client);
  }

  async getFaces() {
    try {
      return this.database.listDocuments("faces-register", "faces");
    } catch (error) {
      throw Error("get faces:", error);
    }
  }

  async getMatches(queries = []) {
    try {
      return this.database.listDocuments("faces-register", "faces", queries);
    } catch (error) {
      throw Error("get match", error);
    }
  }

  async storeFaces(data) {
    console.log("data", data);
    try {
      return this.database.createDocument(
        "faces-register",
        "faces",
        ID.unique(),
        data
      );
    } catch (error) {
      throw Error("get match", error);
    }
  }
}

export const appwriteService = new AppwriteService();
