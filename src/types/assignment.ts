import type { SakaiDate, EntityMeta, BaseListResponse } from "./common.js";

/**
 * GET /direct/assignment/site/{siteId}.json
 *   Returns all assignments for a specific site.
 *
 * GET /direct/assignment/my.json
 *   Returns all assignments for the authenticated user across all sites.
 *
 * GET /direct/assignment/item/{assignmentId}.json
 *   Returns a single assignment by ID.
 */

export interface Assignment extends EntityMeta {
  id: string;
  context: string;
  creator: string;
  author: string;
  authorLastModified: string;
  draft: boolean;
  access: string;
  instructions: string;
  /** Submission content; structure varies by assignment type. */
  content: unknown;
  attachments: string[];
  /** Group IDs mapped to their titles. */
  groups: Record<string, string>;
  allPurposeItemText: string;
  allowResubmission: boolean;
  closeTime: SakaiDate;
  closeTimeString: string;
  dueTime: SakaiDate;
  dueTimeString: string;
  dropDeadTime: SakaiDate;
  dropDeadTimeString: string;
  gradeScale: string;
  gradeScaleMaxPoints: string;
  gradebookItemId: number;
  gradebookItemName: string;
}

export interface AssignmentListResponse extends BaseListResponse {
  assignment_collection: Assignment[];
}
