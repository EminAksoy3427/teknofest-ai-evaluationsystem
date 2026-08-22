export interface StoredSubmissionReport {
  etag: string;
}

export interface StoredDocumentArtifact {
  etag: string;
}

export interface StoredTemplateFile {
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
  putDocumentArtifact(
    binding: R2Bucket,
    storageKey: string,
    body: string,
  ): Promise<StoredDocumentArtifact>;
  getDocumentArtifact(binding: R2Bucket, storageKey: string): Promise<R2ObjectBody | null>;
  headDocumentArtifact(binding: R2Bucket, storageKey: string): Promise<R2Object | null>;
  /** The official report-template PDF. Same private `DOCUMENTS` boundary as a submission report. */
  putTemplateFile(
    binding: R2Bucket,
    storageKey: string,
    bytes: Uint8Array,
  ): Promise<StoredTemplateFile>;
  getTemplateFile(binding: R2Bucket, storageKey: string): Promise<R2ObjectBody | null>;
  deleteTemplateFile(binding: R2Bucket, storageKey: string): Promise<void>;
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

  async putDocumentArtifact(binding, storageKey, body) {
    const stored = await binding.put(storageKey, body, {
      httpMetadata: { contentType: "application/json" },
    });
    return { etag: stored.etag };
  },

  getDocumentArtifact(binding, storageKey) {
    return binding.get(storageKey);
  },

  headDocumentArtifact(binding, storageKey) {
    return binding.head(storageKey);
  },

  async putTemplateFile(binding, storageKey, bytes) {
    const stored = await binding.put(storageKey, bytes, {
      httpMetadata: { contentType: "application/pdf" },
    });
    return { etag: stored.etag };
  },

  getTemplateFile(binding, storageKey) {
    return binding.get(storageKey);
  },

  async deleteTemplateFile(binding, storageKey) {
    await binding.delete(storageKey);
  },
};
