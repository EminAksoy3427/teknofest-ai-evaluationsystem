import type { AuthRuntimeBindings } from "../auth/auth";
import { createApp } from "../index";
import type { DocumentStorage } from "../storage/documents";
import type { LocalD1 } from "./local-d1";

// Test-only harness that drives the REAL app composition — every route, every repository, every
// authorization decision — over an in-memory database with the full generated migration chain
// applied. Only the session and the private document bucket are stubbed; everything else this
// harness exercises is production code.

export interface FullTestAppRequestInit {
  method?: string;
  body?: unknown;
  /** Raw, non-JSON body (e.g. PDF bytes) for a PUT upload; takes precedence over `body`. */
  rawBody?: BodyInit | Uint8Array;
  headers?: Record<string, string>;
}

export interface FullTestApp {
  request(userId: string | null, path: string, init?: FullTestAppRequestInit): Promise<Response>;
}

export function createFullTestApp(
  local: LocalD1,
  documentStorage: DocumentStorage,
  /** Extra bindings for routes that read configuration off the environment (e.g. the AI provider
   * settings an AnalysisRun pins at creation time). Never a real credential. */
  extraBindings: Partial<AuthRuntimeBindings> = {},
): FullTestApp {
  const environment = {
    DB: local.binding,
    DOCUMENTS: {} as R2Bucket,
    ...extraBindings,
  } as AuthRuntimeBindings;

  return {
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

      const headers = new Headers(init.headers);
      let body: BodyInit | undefined;
      if (init.rawBody !== undefined) {
        body = init.rawBody as BodyInit;
      } else if (init.body !== undefined) {
        body = JSON.stringify(init.body);
        if (!headers.has("content-type")) headers.set("content-type", "application/json");
      }

      return app.request(
        `http://localhost${path}`,
        { method: init.method ?? "GET", ...(body === undefined ? {} : { body }), headers },
        environment,
      );
    },
  };
}
