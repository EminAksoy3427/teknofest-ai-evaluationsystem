import type { AuthRuntimeBindings } from "../auth/auth";
import { createApp } from "../index";
import type { DocumentStorage } from "../storage/documents";
import type { LocalD1 } from "./local-d1";

// Test-only harness that drives the REAL app composition — real repositories, real membership
// lookup, real authorization — over an in-memory database. Only the session and the private
// document bucket are stubbed, so every authorization decision an assertion observes is the
// production decision.

const REPORT_BYTES = new TextEncoder().encode("%PDF-1.4\nsynthetic reviewer fixture\n%%EOF");

export interface ReviewerTestApp {
  /** Private R2 keys the app asked the document store for, so key exposure can be asserted. */
  requestedStorageKeys: string[];
  request(
    userId: string | null,
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<Response>;
}

export function createReviewerTestApp(local: LocalD1): ReviewerTestApp {
  const requestedStorageKeys: string[] = [];
  const documentStorage = {
    async getSubmissionReport(_binding: R2Bucket, storageKey: string) {
      requestedStorageKeys.push(storageKey);
      return {
        body: new Response(REPORT_BYTES).body,
        size: REPORT_BYTES.byteLength,
        httpEtag: '"synthetic"',
      } as unknown as R2ObjectBody;
    },
  } as unknown as DocumentStorage;

  const environment = { DB: local.binding, DOCUMENTS: {} as R2Bucket } as AuthRuntimeBindings;

  return {
    requestedStorageKeys,
    async request(userId, path, init = {}) {
      const app = createApp({
        resolveSession:
          userId === null
            ? async () => null
            : async () => ({
                user: {
                  id: userId,
                  name: "Test Kullanıcı",
                  email: `${userId}@example.com`,
                  image: null,
                },
              }),
        documentStorage,
      });
      return app.request(
        `http://localhost${path}`,
        {
          method: init.method ?? "GET",
          ...(init.body === undefined
            ? {}
            : {
                body: JSON.stringify(init.body),
                headers: { "content-type": "application/json" },
              }),
        },
        environment,
      );
    },
  };
}
