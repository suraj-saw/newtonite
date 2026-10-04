/**
 * Centralized API HTTP Client
 *
 * Wraps browser `fetch` to provide:
 *  - Automatic `credentials: "include"` for secure HttpOnly cookie transmission.
 *  - JSON content-type header injection for non-FormData payloads.
 *  - Global 401 interception: immediately purges auth state and redirects to login.
 *  - Concurrency conflict normalization: converts HTTP 409 `STALE_VERSION` errors into standard user alerts.
 *  - Typed response decoding with automatic 204 No Content handling.
 */

import { useAuthStore } from "@/store/auth";
import type { ApiError } from "@/types";
import { CONFLICT_MESSAGE } from "@/lib/utils";

const BASE = "/api";

/**
 * Custom error class capturing backend HTTP status, machine-readable error code, and message.
 */
export class ApiRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Perform an authenticated HTTP request to the Newtonite backend API.
 *
 * @template T Expected JSON response shape.
 * @param path URL path relative to `/api` (e.g. `/work-items`).
 * @param init Standard RequestInit options (method, headers, body).
 * @returns Promise resolving to parsed response payload.
 * @throws {ApiRequestError} On non-2xx HTTP responses.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const fetchInit = { ...init, headers, credentials: "include" as RequestCredentials };
  const res = await fetch(`${BASE}${path}`, fetchInit);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Intercept 401 Unauthorized to invalidate client session state
    if (res.status === 401) {
      useAuthStore.getState().logout();
    }
    const err = data as ApiError;
    const message =
      res.status === 409 && err.error?.code === "STALE_VERSION"
        ? CONFLICT_MESSAGE
        : err.error?.message || "Request failed";
    throw new ApiRequestError(res.status, err.error?.code || "ERROR", message);
  }
  return data as T;
}

/**
 * Convenience helper methods for standard HTTP verbs.
 */
export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown, extraHeaders?: Record<string, string>) =>
    apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined, headers: extraHeaders }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path: string) => apiFetch<void>(path, { method: "DELETE" }),
};

