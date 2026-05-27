/**
 * Sakai date object returned by the KULMS REST API.
 * `time` is a UNIX timestamp in milliseconds.
 */
export interface SakaiDate {
  time: number;
  display: string;
}

/** Fields present on every entity returned by the EntityBroker REST layer. */
export interface EntityMeta {
  entityReference: string;
  entityURL: string;
  entityId: string;
  entityTitle: string;
}

/** Top-level wrapper shared by all collection responses. */
export interface BaseListResponse {
  entityPrefix: string;
}
