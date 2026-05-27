/**
 * GET /direct/syllabus/site/{siteId}.json
 *
 * Returns the syllabus items for a specific site.
 */

export interface Syllabus {
  id: string;
  title: string;
  /** HTML body text of this syllabus item. */
  data: string;
  /** Publication status, e.g. "posted" or "draft". */
  status: string;
}

export interface SyllabusListResponse {
  entityReference: string;
  entityURL: string;
  entityTitle: string;
  redirectUrl: string;
  siteId: string;
  items: Syllabus[];
}
