/**
 * Session-aware destinations for public identity routes.
 *
 * These helpers only decide where to send the browser. They do not grant
 * competition access; every /app route still re-authorizes on the server.
 */
const AUTHENTICATED_IDENTITY_PATHS = new Set(["/login", "/register"]);

export function isAppPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

export function unauthenticatedDestination(pathname: string): string | null {
  if (isAppPath(pathname)) return "/login";
  return null;
}

export function authenticatedLoginDestination(pathname: string): string | null {
  if (AUTHENTICATED_IDENTITY_PATHS.has(pathname)) return "/app";
  return null;
}

export function loginFailureMessage(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.has("error") || params.has("error_description")) {
    return "Giriş tamamlanamadı. Lütfen tekrar deneyin.";
  }
  return null;
}
