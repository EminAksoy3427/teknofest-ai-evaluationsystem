import type { DocumentStorage } from "../storage/documents";

/**
 * A real, in-memory, read-your-writes R2 stand-in. Unlike `reviewer-app.ts`'s fixed-bytes stub
 * (which is fine for reviewer report tests that only ever read one already-known object), template
 * file tests need genuine put/get/delete semantics across MULTIPLE keys — upload, replace,
 * compensation-on-failure and "the old object is gone but the new one still resolves" all depend on
 * the store actually keying by the storage key it was given.
 */
export interface MemoryDocumentStorage {
  storage: DocumentStorage;
  objects: Map<string, Uint8Array>;
  /** Every storage key ever written, in call order — so a test can assert a fresh key per upload. */
  putKeys: string[];
  /** Every storage key ever deleted, in call order. */
  deletedKeys: string[];
}

export function createMemoryDocumentStorage(): MemoryDocumentStorage {
  const objects = new Map<string, Uint8Array>();
  const putKeys: string[] = [];
  const deletedKeys: string[] = [];

  function object(bytes: Uint8Array, key: string) {
    return {
      body: new Blob([bytes as BlobPart]).stream(),
      size: bytes.byteLength,
      httpEtag: `"${key}"`,
      async arrayBuffer() {
        return bytes.buffer;
      },
    } as unknown as R2ObjectBody;
  }

  const storage: DocumentStorage = {
    async putSubmissionReport(_binding, key, bytes) {
      objects.set(key, bytes);
      putKeys.push(key);
      return { etag: `"${key}"` };
    },
    async getSubmissionReport(_binding, key) {
      const bytes = objects.get(key);
      return bytes ? object(bytes, key) : null;
    },
    async deleteSubmissionReport(_binding, key) {
      objects.delete(key);
      deletedKeys.push(key);
    },
    async headSubmissionReport(_binding, key) {
      return objects.has(key) ? ({} as R2Object) : null;
    },
    async putDocumentArtifact(_binding, key, body) {
      objects.set(key, new TextEncoder().encode(body));
      putKeys.push(key);
      return { etag: `"${key}"` };
    },
    async getDocumentArtifact(_binding, key) {
      const bytes = objects.get(key);
      return bytes ? object(bytes, key) : null;
    },
    async headDocumentArtifact(_binding, key) {
      return objects.has(key) ? ({} as R2Object) : null;
    },
    async putTemplateFile(_binding, key, bytes) {
      objects.set(key, bytes);
      putKeys.push(key);
      return { etag: `"${key}"` };
    },
    async getTemplateFile(_binding, key) {
      const bytes = objects.get(key);
      return bytes ? object(bytes, key) : null;
    },
    async deleteTemplateFile(_binding, key) {
      objects.delete(key);
      deletedKeys.push(key);
    },
  };

  return { storage, objects, putKeys, deletedKeys };
}
