/**
 * POST /direct/session
 *
 * Authenticates a user and establishes a session.
 * The session ID is returned and should be passed as a cookie on subsequent requests.
 */

export interface SessionCreateRequest {
  id: string;
  password: string;
}

export interface SessionCreateResponse {
  /** Active session identifier. Pass as the `JSESSIONID` cookie. */
  sessionId: string;
}

/**
 * GET /direct/session/current.json
 *
 * Returns the caller's current session. `id` is always null (the session
 * token is withheld); an authenticated session is one whose `userEid` is
 * populated (e.g. "a0264799").
 */
export interface CurrentSession {
  attributeNames: unknown;
  attributes: unknown;
  /** UNIX timestamp in milliseconds. */
  creationTime: number;
  /** UNIX timestamp in milliseconds. */
  currentTime: number;
  /** Always null — the session token is not exposed. */
  id: string | null;
  /** UNIX timestamp in milliseconds. */
  lastAccessedTime: number;
  maxInactiveInterval: number;
  /** Login username; null for anonymous sessions. */
  userEid: string | null;
  /** Internal Sakai user UUID; null for anonymous sessions. */
  userId: string | null;
  active: boolean;
  entityReference: string;
  entityURL: string;
  entityTitle: string;
}
