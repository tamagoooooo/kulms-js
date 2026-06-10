import type { SakaiDate } from "../types/common.js";
import type { Assignment as AssignmentData } from "../types/assignment.js";
import type { KUClient } from "./KUClient.js"; // type-only; kept for future methods (submit, etc.)

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

  get dueTime(): SakaiDate {
    return this.data.dueTime;
  }
}
