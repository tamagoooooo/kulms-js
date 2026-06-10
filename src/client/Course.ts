import type { Site } from "../types/site.js";
import type { AssignmentListResponse } from "../types/assignment.js";
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
}
