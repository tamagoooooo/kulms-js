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
