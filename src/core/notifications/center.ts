// 通知の判断（コアの 1 か所）: 変更の知らせ（Bus）から、チャットの完了・失敗・回答待ち・AI からの知らせ（notify_user）と CI の失敗を見つけ、それを見ていない人にだけ送る:
// この Mac の通知（メインプロセスが startCore({ notify }) で渡す口）と、つないだ端末のプッシュ（PushSender。中身はあとで足す。CI の失敗は送らない）
import type { BusEvent, ChatStatus, DevicePush } from "@shared/types";
import type { Bus } from "../bus.js";
import type { Store } from "../db/store.js";
import { aiNotice, approvalNotice, chatNotice, ciNotice, type Notice } from "./notices.js";
import type { Viewer, ViewingRegistry } from "./viewing.js";

/** この Mac の通知を出す口（Mac のアプリのメインプロセス。単体のコアにはない） */
export type DesktopNotify = (notice: Notice) => void;

/** プッシュで送る中身（短い文と、本体の ID・押したときに開くもの。会話の中身は載せない） */
export interface PushMessage {
  title: string;
  body: string;
  host_id: string;
  target: Notice["target"];
}

/** 送った結果（sent: 送った / gone: 宛先がもう使えない（表から外す）/ skipped: この種類の宛先にはまだ送らない） */
export type PushResult = "sent" | "gone" | "skipped";

/** スマホのプッシュ（Expo Push は notifications/expoPush.ts。Web Push はまだ） */
export interface PushSender {
  send(push: DevicePush, message: PushMessage): Promise<PushResult>;
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
    // この Mac の通知は、この Mac の画面で見ていなければ（設定でオンのとき）
    if (this.opts.store.settings.get().desktop_notifications && !this.viewing("host", notice)) this.opts.desktop?.(notice);
    // CI の失敗はこの Mac だけ（CI のタブは端末に開いていない）
    if (notice.kind !== "ci_failed") this.sendPush(notice);
  }

  /** その人が、その知らせのチャット・CI のタブを見ているか */
  private viewing(viewer: Viewer, notice: Notice): boolean {
    const { target } = notice;
    return target.kind === "chat" ? this.opts.viewing.viewingChat(viewer, target.chat_id) : this.opts.viewing.viewingCi(viewer, target.project_id);
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
    if (e.type === "ai_notice") {
      const chat = this.opts.store.chats.get(e.chat_id);
      return chat ? aiNotice(chat, e.message, projectName(chat.project_id)) : null;
    }
    return null;
  }

  /** プッシュの宛先を登録した端末のうち、そのチャットを見ていない端末へ（送れなくても、ほかの端末・この Mac の通知は止めない） */
  private sendPush(notice: Notice): void {
    const sender = this.opts.push;
    if (!sender) return;
    const { store } = this.opts;
    for (const device of store.devices.list()) {
      const push = device.has_push && !this.viewing(device.id, notice) ? store.devices.push(device.id) : null;
      if (!push) continue;
      void sender.send(push, { ...notice.push, host_id: store.databaseId, target: notice.target }).then(
        // 宛先がもう使えなければ表から外す（その間に端末が登録し直していれば、新しい宛先は残す）
        (result) => result === "gone" && JSON.stringify(store.devices.push(device.id)) === JSON.stringify(push) && store.devices.setPush(device.id, null),
        (e: unknown) => console.warn("[notifications] プッシュを送れません:", e),
      );
    }
  }
}
