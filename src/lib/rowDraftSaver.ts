/**
 * Autosave for one row that someone is typing into (the job's JHA draft, a Daily JSA).
 *
 * Saves a moment after typing stops, one save at a time, always the newest content.
 * A save only lands on the version of the row it started from, so two people can't
 * silently overwrite each other: the second one gets "conflict".
 */
import { describeSupabaseError, withWriteRetry, type PostgrestLikeResult } from "@/lib/supabaseRetry";

export type DraftSaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";

export interface RowSaveAdapter<T> {
  /** For error messages and retry logs, like "save JHA". */
  label: string;
  /** Update the row only where updated_at still equals savedAt, returning the new updated_at. */
  update: (content: T, saveId: string, savedAt: string) => PromiseLike<PostgrestLikeResult<{ updated_at: string }[] | null>>;
  /** Read the row's current updated_at and last_save_id. */
  read: () => PromiseLike<PostgrestLikeResult<{ updated_at: string; last_save_id: string | null } | null>>;
}

export class RowDraftSaver<T> {
  private pending: T | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private state: DraftSaveState = "saved";

  constructor(
    private readonly adapter: RowSaveAdapter<T>,
    readonly id: string,
    private savedAt: string,
    private readonly onState: (state: DraftSaveState, message?: string) => void,
    private readonly delayMs = 800,
  ) {}

  /** The saved row's updated_at, for finishing. */
  get updatedAt(): string {
    return this.savedAt;
  }

  private set(state: DraftSaveState, message?: string) {
    this.state = state;
    this.onState(state, message);
  }

  queue(content: T) {
    if (this.state === "conflict") return;
    this.pending = content;
    this.set("unsaved");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  /** Saves now. False when something couldn't be saved. */
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    for (;;) {
      if (this.running) {
        await this.running;
        continue;
      }
      if (this.state === "conflict") return false;
      if (!this.pending) return this.state !== "error";
      const content = this.pending;
      this.pending = null;
      this.running = this.write(content).finally(() => {
        this.running = null;
      });
      await this.running;
      if (this.failed()) return false;
    }
  }

  private failed(): boolean {
    return this.state === "error" || this.state === "conflict";
  }

  private async write(content: T): Promise<void> {
    this.set("saving");
    const saveId = crypto.randomUUID();
    const savedAt = this.savedAt;
    const { data, error, status } = await withWriteRetry(() => this.adapter.update(content, saveId, savedAt), {
      label: this.adapter.label,
    });

    if (error) {
      // Keep it for the next try, unless newer typing already replaced it
      this.pending ??= content;
      this.set("error", describeSupabaseError(error, status));
      return;
    }
    if (data && data.length > 0) {
      this.savedAt = data[0].updated_at;
      this.set(this.pending ? "unsaved" : "saved");
      return;
    }

    // Nothing matched. Either someone else saved, or our own save landed and its reply got lost.
    const { data: row, error: readError } = await this.adapter.read();
    if (readError) {
      this.pending ??= content;
      this.set("error", describeSupabaseError(readError));
    } else if (row && row.last_save_id === saveId) {
      this.savedAt = row.updated_at;
      this.set(this.pending ? "unsaved" : "saved");
    } else {
      this.pending = null;
      this.set("conflict");
    }
  }
}
