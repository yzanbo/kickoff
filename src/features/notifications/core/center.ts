// 通知の判断（コアの 1 か所）: 変更の知らせ（Bus）から、チャットの完了・失敗・回答待ち・AI からの知らせ（notify_user）と CI の失敗を見つけ、
// それを見ていない人にだけ、登録された届け先へ渡す: この Mac の通知（desktop。Mac のアプリのメインプロセスの口）と、つないだ端末のプッシュ（push。devices が登録する）
import type { ChatStatus } from "@shared/chat/types";
import type { BusEvent } from "@shared/foundation/contract";
import type { Notice } from "@shared/foundation/ipc/notifications";
import type { Bus } from "@/foundation/core/bus";
import type { ChatStoreDeps } from "@/features/chat/core/index";
import type { Kernel } from "@/foundation/core/kernel";
import { aiNotice, approvalNotice, chatNotice, ciNotice } from "./notices";
import type { Viewer, ViewingRegistry } from "./viewing";

/**
 * 知らせの届け先。desktop = この Mac の通知（設定でオン・この Mac の画面で見ていないときだけ渡す）、
 * push = つないだ端末のプッシュ（CI の失敗は渡さない = CI のタブは端末に開いていない。どの端末が見ているかは届け先が seen で聞く）
 */
export interface NoticeSink {
  name: "desktop" | "push";
  /** 知らせる（seen = その人がその知らせのチャット・CI のタブを見ているか。返すのを待たない） */
  deliver(notice: Notice, seen: (viewer: Viewer) => boolean): void;
}

/** この Mac の通知を出す口（Mac のアプリのメインプロセス。単体のコアにはない） */
export type DesktopNotify = (notice: Notice) => void;

interface CenterOptions {
  bus: Bus;
  store: Pick<ChatStoreDeps, "chats" | "projects"> & { settings: Kernel["settings"] };
  viewing: ViewingRegistry;
}

export class NotificationCenter {
  private readonly unsubscribe: () => void;
  private readonly sinks: NoticeSink[] = [];

  constructor(private readonly opts: CenterOptions) {
    this.unsubscribe = opts.bus.subscribe((e) => this.onEvent(e));
  }

  close(): void {
    this.unsubscribe();
  }

  addSink(sink: NoticeSink): void {
    this.sinks.push(sink);
  }

  /** チャットの 1 回の実行が終わった（組み立てが chat の殻の onTurnEnded から渡す）: 最後まで終わった・失敗したら知らせる */
  turnEnded(chatId: number, status: ChatStatus): void {
    const chat = this.opts.store.chats.get(chatId);
    if (chat) this.deliver(chatNotice({ ...chat, status }, this.opts.store.projects.get(chat.project_id)?.name ?? "プロジェクト"));
  }

  private onEvent(e: BusEvent): void {
    this.deliver(this.noticeOf(e));
  }

  private deliver(notice: Notice | null): void {
    if (!notice) return;
    const seen = (viewer: Viewer) => this.viewing(viewer, notice);
    // この Mac の通知は、この Mac の画面で見ていなければ（設定でオンのとき）
    if (this.opts.store.settings.get().desktop_notifications && !seen("host")) this.to("desktop", notice, seen);
    // CI の失敗はこの Mac だけ（CI のタブは端末に開いていない）
    if (notice.kind !== "ci_failed") this.to("push", notice, seen);
  }

  private to(name: NoticeSink["name"], notice: Notice, seen: (viewer: Viewer) => boolean): void {
    for (const sink of this.sinks) if (sink.name === name) sink.deliver(notice, seen);
  }

  /** その人が、その知らせのチャット・CI のタブを見ているか */
  private viewing(viewer: Viewer, notice: Notice): boolean {
    const { target } = notice;
    return target.kind === "chat" ? this.opts.viewing.viewingChat(viewer, target.chat_id) : this.opts.viewing.viewingCi(viewer, target.project_id);
  }

  private noticeOf(e: BusEvent): Notice | null {
    const projectName = (id: number) => this.opts.store.projects.get(id)?.name ?? "プロジェクト";
    if (e.type === "approval") return approvalNotice(e.approval, this.opts.store.chats.get(e.approval.chat_id) ?? null, projectName(e.approval.project_id));
    if (e.type === "ci_failed") return ciNotice(e.failure, projectName(e.failure.project_id));
    if (e.type === "ai_notice") {
      const chat = this.opts.store.chats.get(e.chat_id);
      return chat ? aiNotice(chat, e.message, projectName(chat.project_id)) : null;
    }
    return null;
  }
}
