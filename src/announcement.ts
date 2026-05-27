import type { SakaiDate, EntityMeta, BaseListResponse } from "./common.js";

/**
 * GET /direct/announcement/site/{siteId}.json
 *   Returns announcements for a specific site.
 *
 * GET /direct/announcement/user.json
 *   Returns all announcements visible to the authenticated user.
 */

export interface Announcement extends EntityMeta {
  announcementId: string;
  id: string;
  title: string;
  body: string;
  channel: string;
  siteId: string;
  siteTitle: string;
  createdByDisplayName: string;
  createdOn: SakaiDate;
  attachments: string[];
}

export interface AnnouncementListResponse extends BaseListResponse {
  announcement_collection: Announcement[];
}
