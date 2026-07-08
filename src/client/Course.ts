import type { Site } from "../types/site.js";
import type { AssignmentListResponse } from "../types/assignment.js";
import type { Announcement, AnnouncementListResponse } from "../types/announcement.js";
import type { CalendarEvent, CalendarListResponse } from "../types/calendar.js";
import type { Content, ContentListResponse } from "../types/content.js";
import type { KUClient } from "./KUClient.js"; // type-only → no runtime import cycle
import { Assignment } from "./Assignment.js";

export class Course {
  constructor(
    private readonly client: KUClient,
    readonly site: Site,
  ) {}

  get id(): string {
    return this.site.id;
  }

  get title(): string {
    return this.site.title;
  }

  async assignments(): Promise<Assignment[]> {
    const data = await this.client.getJSON<AssignmentListResponse>(
      `/assignment/site/${this.site.id}.json`,
    );
    return data.assignment_collection.map((a) => new Assignment(this.client, a));
  }

  async announcements(): Promise<Announcement[]> {
    const data = await this.client.getJSON<AnnouncementListResponse>(
      `/announcement/site/${this.site.id}.json`,
    );
    return data.announcement_collection;
  }

  async calendarEvents(): Promise<CalendarEvent[]> {
    const data = await this.client.getJSON<CalendarListResponse>(
      `/calendar/site/${this.site.id}.json`,
    );
    return data.calendar_collection;
  }

  /** Files and folders in the course's Resources tool. */
  async resources(): Promise<Content[]> {
    const data = await this.client.getJSON<ContentListResponse>(
      `/content/site/${this.site.id}.json`,
    );
    return data.content_collection;
  }

  // No syllabus() — /direct/syllabus/site/{id}.json returns HTTP 500 for
  // every KULMS site (verified 2026-07-08); Kyoto-U syllabi live in KULASIS.
}
