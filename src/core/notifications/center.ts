// 通知の判断（コアの 1 か所）: 変更の知らせ（Bus）から、チャットの完了・失敗・回答待ちと CI の失敗を見つけ、だれも見ていなければ、
// この Mac の通知（メインプロセスが startCore({ notify }) で渡す口）と、つないだ端末のプッシュ（PushSender。中身はあとで足す）に送る
import type { BusEvent, ChatStatus, DevicePush } from "@shared/types";
import type { Bus } from "../bus.js";
import type { Store } from "../db/store.js";
import { approvalNotice, chatNotice, ciNotice, type Notice } from "./notices.js";
import type { ViewingRegistry } from "./viewing.js";

/** この Mac の通知を出す口（Mac のアプリのメインプロセス。単体のコアにはない） */
export type DesktopNotify = (notice: Notice) => void;

/** スマホのプッシュ（Expo Push・Web Push）。送る中身は短い文と、本体の ID・押したときに開くもの（会話の中身は載せない） */
export interface PushSender {
  send(push: DevicePush, message: { title: string; body: string; host_id: string; target: Notice["target"] }): Promise<void>;
}

interface CenterOptions {
  bus: Bus;
  store: Store;
  viewing: ViewingRegistry;
  desktop?: DesktopNotify;
  push?: PushSender;
}

export class NotificationCenter {
  /** チャットごとの直前の状態（作業中から終わった・失敗に変わったときだけ知らせる） */
  private readonly last = new Map<number, ChatStatus>();
  private readonly unsubscribe: () => void;

  constructor(private readonly opts: CenterOptions) {
    this.unsubscribe = opts.bus.subscribe((e) => this.onEvent(e));
  }

  close(): void {
    this.unsubscribe();
  }

  private onEvent(e: BusEvent): void {
    const notice = this.noticeOf(e);
    if (!notice) return;
    const { target } = notice;
    const viewed = target.kind === "chat" ? this.opts.viewing.viewingChat(target.chat_id) : this.opts.viewing.viewingCi(target.project_id);
    if (viewed) return;
    if (this.opts.store.settings.get().desktop_notifications) this.opts.desktop?.(notice);
    this.sendPush(notice);
  }

  private noticeOf(e: BusEvent): Notice | null {
    const projectName = (id: number) => this.opts.store.projects.get(id)?.name ?? "プロジェクト";
    if (e.type === "chat") {
      const prev = this.last.get(e.chat.id);
      this.last.set(e.chat.id, e.chat.status);
      if (prev !== "running" || e.chat.status === "running") return null;
      return chatNotice(e.chat, projectName(e.chat.project_id));
    }
    if (e.type === "chat_deleted") {
      this.last.delete(e.id);
      return null;
    }
    if (e.type === "approval") return approvalNotice(e.approval, this.opts.store.chats.get(e.approval.chat_id) ?? null, projectName(e.approval.project_id));
    if (e.type === "ci_failed") return ciNotice(e.failure, projectName(e.failure.project_id));
    return null;
  }

  /** プッシュの宛先を登録した端末へ（送れなくても、ほかの端末・この Mac の通知は止めない） */
  private sendPush(notice: Notice): void {
    const sender = this.opts.push;
    if (!sender) return;
    const { store } = this.opts;
    for (const device of store.devices.list()) {
      const push = device.has_push ? store.devices.push(device.id) : null;
      if (!push) continue;
      void sender.send(push, { ...notice.push, host_id: store.databaseId, target: notice.target }).catch((e: unknown) => console.warn("[notifications] プッシュを送れません:", e));
    }
  }
}
