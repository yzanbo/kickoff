// いまだれが何を見ているか（呼び主ごと。この Mac の画面・端末が PUT /api/viewing で知らせる）。
// 通知は、その知らせを見ていない呼び主にだけ送る（この Mac で見ていても、見ていないスマホにはプッシュする）
import { VIEWING_TTL_MS, type ViewingBody } from "@shared/types";
import type { Caller } from "../http/caller.js";

/** 見ている人（この Mac の画面か、端末の ID） */
export type Viewer = "host" | number;

const viewerOf = (caller: Caller): Viewer => (caller.kind === "host" ? "host" : caller.device.id);

export class ViewingRegistry {
  private readonly views = new Map<Viewer, { view: ViewingBody; at: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** 呼び主が見ているものを覚える（両方 null なら、何も見ていない） */
  report(caller: Caller, view: ViewingBody): void {
    this.views.set(viewerOf(caller), { view, at: this.now() });
  }

  /** その人がそのチャットを見ているか（知らせが古くなったものは数えない） */
  viewingChat(viewer: Viewer, chatId: number): boolean {
    return this.current(viewer)?.chat_id === chatId;
  }

  /** その人がそのプロジェクトの CI のタブを見ているか */
  viewingCi(viewer: Viewer, projectId: number): boolean {
    return this.current(viewer)?.ci_project_id === projectId;
  }

  private current(viewer: Viewer): ViewingBody | null {
    const entry = this.views.get(viewer);
    if (!entry) return null;
    if (this.now() - entry.at > VIEWING_TTL_MS) {
      this.views.delete(viewer);
      return null;
    }
    return entry.view;
  }
}
