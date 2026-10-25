/**
 * The real `@google-cloud/storage`-backed {@link ObjectStore}. The only file that imports the
 * Storage SDK, so `gcs-bundle-source.ts` and its tests stay SDK-free. Auth is Application Default
 * Credentials (GOOGLE_APPLICATION_CREDENTIALS, or `gcloud auth application-default login`).
 */
import { Storage } from "@google-cloud/storage";
import type { ObjectStore } from "./gcs-bundle-source.js";

export function createGcsObjectStore(bucketName: string): ObjectStore {
  const bucket = new Storage().bucket(bucketName);
  return {
    async list(prefix) {
      const [files] = await bucket.getFiles({ prefix });
      return files.map((f) => f.name);
    },
    async download(objectName) {
      const [buffer] = await bucket.file(objectName).download();
      return buffer.toString("utf8");
    },
  };
}
