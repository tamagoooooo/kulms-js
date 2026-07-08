import type { Assignment as AssignmentData } from "../types/assignment.js";
import type { KUClient } from "./KUClient.js"; // type-only → no runtime import cycle

export class Assignment {
  constructor(
    private readonly client: KUClient,
    readonly data: AssignmentData,
  ) {}

  get id(): string {
    return this.data.id;
  }

  get title(): string {
    return this.data.entityTitle;
  }

  /**
   * Full record from /assignment/item/{id}.json. The site/my list views omit
   * some fields (dueTime, instructions, …); this fetches everything.
   */
  async details(): Promise<AssignmentData> {
    return this.client.getJSON<AssignmentData>(
      `/assignment/item/${this.data.id}.json`,
    );
  }
}
