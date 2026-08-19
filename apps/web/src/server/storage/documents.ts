export interface StoredSubmissionReport {
  etag: string;
}

export interface DocumentStorage {
  putSubmissionReport(
    binding: R2Bucket,
    storageKey: string,
    bytes: Uint8Array,
  ): Promise<StoredSubmissionReport>;
  getSubmissionReport(binding: R2Bucket, storageKey: string): Promise<R2ObjectBody | null>;
  deleteSubmissionReport(binding: R2Bucket, storageKey: string): Promise<void>;
  headSubmissionReport(binding: R2Bucket, storageKey: string): Promise<R2Object | null>;
}

export const documentStorage: DocumentStorage = {
  async putSubmissionReport(binding, storageKey, bytes) {
    const stored = await binding.put(storageKey, bytes, {
      httpMetadata: { contentType: "application/pdf" },
    });
    return { etag: stored.etag };
  },

  getSubmissionReport(binding, storageKey) {
    return binding.get(storageKey);
  },

  async deleteSubmissionReport(binding, storageKey) {
    await binding.delete(storageKey);
  },

  headSubmissionReport(binding, storageKey) {
    return binding.head(storageKey);
  },
};
