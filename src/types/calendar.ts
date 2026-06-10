import type { SakaiDate, EntityMeta, BaseListResponse } from "./common.js";

/**
 * GET /direct/calendar/site/{siteId}.json
 *   Returns all calendar events for a specific site.
 *
 * GET /direct/calendar/my.json
 *   Returns all calendar events for the authenticated user across all sites.
 *
 * GET /direct/calendar/event/{siteId}/{eventId}.json
 *   Returns a single calendar event.
 */

export interface CalendarRecurrenceRule {
  frequency: string;
  interval: number;
  count: number;
  /** UNIX timestamp (ms) of the last occurrence, or 0 if unbounded. */
  until: number;
}

export interface CalendarEvent extends EntityMeta {
  eventId: string;
  title: string;
  description: string;
  type: string;
  eventIcon: string;
  /** Duration of the event in milliseconds. */
  duration: number;
  firstTime: SakaiDate;
  siteId: string;
  siteName: string;
  creator: string;
  /** Linked assignment ID if this event was created from an assignment. */
  assignmentId: string;
  reference: string;
  recurrenceRule: CalendarRecurrenceRule | null;
}

export interface CalendarListResponse extends BaseListResponse {
  calendar_collection: CalendarEvent[];
}
