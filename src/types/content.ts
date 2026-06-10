import type { SakaiDate, EntityMeta, BaseListResponse } from "./common.js";

/**
 * GET /direct/content/site/{siteId}.json
 *   Returns all resources (files/folders) for a specific site.
 *
 * GET /direct/content/my.json
 *   Returns all resources owned by the authenticated user.
 */

export interface Content extends EntityMeta {
  author: string;
  authorId: string;
  /** Parent collection (folder) path. */
  container: string;
  copyrightAlert: string;
  description: string;
  title: string;
  /** MIME type for files, or "collection" for folders. */
  type: string;
  url: string;
  usage: string;
  /** File size in bytes; 0 for folders. */
  size: number;
  /** Number of children for folders; 0 for files. */
  numChildren: number;
  hidden: boolean;
  visible: boolean;
  /** ISO 8601 date string of the last modification. */
  modifiedDate: string;
  endDate: SakaiDate | null;
  fromDate: SakaiDate | null;
  webLinkUrl: string | null;
  quota: number | null;
}

export interface ContentListResponse extends BaseListResponse {
  content_collection: Content[];
}
