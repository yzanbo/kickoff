// いまだれが何を見ているか（呼び主ごと。この Mac の画面・端末が PUT /api/viewing で知らせる）。通知を出すかの判断に使う
import { VIEWING_TTL_MS, type ViewingBody } from "@shared/types";
import type { Caller } from "../http/caller.js";

const keyOf = (caller: Caller) => (caller.kind === "host" ? "host" : `device:${caller.device.id}`);

export class ViewingRegistry {
  private readonly views = new Map<string, { view: ViewingBody; at: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** 呼び主が見ているものを覚える（両方 null なら、何も見ていない） */
  report(caller: Caller, view: ViewingBody): void {
    this.views.set(keyOf(caller), { view, at: this.now() });
  }

  /** そのチャットをだれかが見ているか（知らせが古くなったものは数えない） */
  viewingChat(chatId: number): boolean {
    return this.some((v) => v.chat_id === chatId);
  }

  /** そのプロジェクトの CI のタブをだれかが見ているか */
  viewingCi(projectId: number): boolean {
    return this.some((v) => v.ci_project_id === projectId);
  }

  private some(match: (view: ViewingBody) => boolean): boolean {
    const now = this.now();
    for (const [key, { view, at }] of this.views) {
      if (now - at > VIEWING_TTL_MS) this.views.delete(key);
      else if (match(view)) return true;
    }
    return false;
  }
}
