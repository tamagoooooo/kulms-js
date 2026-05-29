import type { SakaiDate, EntityMeta, BaseListResponse } from "./common.js";

/**
 * GET /direct/site.json
 *
 * Returns all sites (courses) the authenticated user belongs to.
 */

export interface SiteOwner {
  userId: string;
  userDisplayName: string;
}

export interface SitePage {
  id: string;
  title: string;
  url: string;
  toolIds: string[];
}

export interface SiteGroup {
  id: string;
  title: string;
  description: string;
}

export interface Site extends EntityMeta {
  id: string;
  title: string;
  description: string;
  shortDescription: string;
  htmlDescription: string;
  htmlShortDescription: string;
  type: string;
  published: boolean;
  pubView: boolean;
  joinable: boolean;
  joinerRole: string;
  maintainRole: string;
  owner: string;
  contactName: string;
  contactEmail: string;
  skin: string;
  iconUrl: string;
  iconUrlFull: string;
  infoUrl: string;
  infoUrlFull: string;
  reference: string;
  providerGroupId: string;
  empty: boolean;
  softlyDeleted: boolean;
  activeEdit: boolean;
  customPageOrdered: boolean;
  /** Last-modified timestamp in UNIX milliseconds. */
  lastModified: number;
  createdDate: SakaiDate;
  createdTime: SakaiDate;
  modifiedDate: SakaiDate;
  modifiedTime: SakaiDate;
  softlyDeletedDate: SakaiDate | null;
  siteOwner: SiteOwner;
  /** Arbitrary site properties stored as key-value pairs. */
  props: Record<string, string>;
  siteGroups: SiteGroup[];
  siteGroupsList: SiteGroup[];
  sitePages: SitePage[];
  userRoles: string[];
}

export interface SiteListResponse extends BaseListResponse {
  site_collection: Site[];
}
