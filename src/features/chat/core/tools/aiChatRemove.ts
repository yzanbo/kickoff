// チャットの AI がチャットをアーカイブする・消す（kickoff_chat の archive_chat・delete_chat の中身。プロバイダーに依らない）。
// 使うのは利用者が頼んだときだけ（ツールの説明で伝える）。どちらも戻せる（アーカイブは画面から戻せ、削除は Kickoff のゴミ箱に 3 日）ので承認は聞かない。
// 相手は同じプロジェクトのチャット（家系に依らない）で、子孫も一緒（画面のアーカイブ・削除と同じ）。作業中のチャットが含まれていれば断る。
// ただし、作業中なのがツールを呼んだチャット自身だけ（自分・自分の祖先を頼まれた）なら、その作業が終わってから行う（予約。送信待ちは止めておく）
import type { ChatLive } from "@shared/chat/chatLive";
import { systemClock, type Clock, type TimerHandle } from "@/foundation/core/clock";
import { errorMessage } from "@shared/foundation/errors";
import { UNTITLED_CHAT_TITLE, type Chat } from "@shared/chat/types";
import type { Store } from "@/features/chat/core/stores";
import type { TrashApi } from "@/features/trash/core/index";
import { toolChat } from "./context";
import { archiveChatFamily } from "@/features/chat/core/update";
import { trashChat } from "@/features/chat/core/sessions/chatTrash";

/** アーカイブか削除か */
export type RemoveAction = "archive" | "delete";

const ACTION_LABELS: Record<RemoveAction, string> = { archive: "アーカイブ", delete: "削除" };

export interface ChatRemoverDeps {
  store: Store;
  /** チャットの実行の殻（作業中か・送信待ちを止める・作業中の状態を捨てる・1 回の実行が終わった知らせ） */
  runner: {
    isBusy(chatId: number): boolean;
    requireIdle(chatId: number, action: string): void;
    forget(chatId: number): void;
    setQueuePaused(chatId: number, paused: boolean): Promise<boolean>;
    onTurnEnded(fn: (chatId: number) => void): () => void;
    live(chatId: number): Pick<ChatLive, "phase">;
  };
  trashBin: Pick<TrashApi, "addRecord">;
  /** 予約を、頼んだチャットの作業の後始末が済むのを待って確かめ直す間隔（テストで縮める） */
  retryMs?: number;
  /** 予約を確かめ直す時計（省けば本物） */
  clock?: Pick<Clock, "setTimeout" | "clearTimeout">;
}

/** 予約（頼んだチャットの作業が終わってから行う） */
interface Reservation {
  action: RemoveAction;
  targetId: number;
}

/** 文の中の名前 */
const nameOf = (chat: Chat) => chat.title.trim() || UNTITLED_CHAT_TITLE;

/** 一緒に扱う子孫の数の添え書き */
const withOthers = (count: number) => (count > 0 ? `（子チャットなど ${count} 件も一緒に）` : "");

export class ChatRemover {
  /** 予約（頼んだチャット → 予約の並び） */
  private readonly reserved = new Map<number, Reservation[]>();
  private readonly unsubscribe: () => void;
  private timer: TimerHandle | null = null;

  constructor(private readonly deps: ChatRemoverDeps) {
    // 1 回の実行が終わったら予約を確かめる。予約したチャットなら、送信待ちを先に止める（アーカイブ・削除するつもりのチャットで次の指示が勝手に動かないように）
    this.unsubscribe = deps.runner.onTurnEnded((chatId) => {
      if (this.reserved.size === 0) return;
      if (this.reserved.has(chatId)) void deps.runner.setQueuePaused(chatId, true);
      this.schedule();
    });
  }

  close() {
    this.unsubscribe();
    if (this.timer) (this.deps.clock ?? systemClock).clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * AI の archive_chat・delete_chat。chatId のチャットの AI が targetId のチャットをアーカイブする・消す。
   * AI に返す文を返す（できなければ理由の文で throw）
   */
  fromChat(chatId: number, action: RemoveAction, targetId: number): string {
    const { store, runner } = this.deps;
    const { self: selfChat, chatInProject } = toolChat(store.chats, chatId);
    const self = selfChat();
    const target = chatInProject(self, targetId, "list_project_chats・list_family_chats で ID を確かめてください");
    const label = `チャット「${nameOf(target)}」（ID ${target.id}）`;
    if (action === "archive" && target.archived_at !== null) return `${label}は、もうアーカイブしてあります。`;
    const family = this.familyOf(action, target);
    const busy = family.filter((c) => c.id !== chatId && runner.isBusy(c.id));
    if (busy.length > 0) {
      throw new Error(
        `作業中のチャット（${busy.map((c) => `「${nameOf(c)}」`).join("・")}）が含まれているので${ACTION_LABELS[action]}できません（待たずに断りました）。作業が終わってから、もう一度頼んでください`,
      );
    }
    if (!family.some((c) => c.id === chatId)) return this.perform(action, target, chatId);
    // 自分（自分の祖先なら子孫の自分も）は作業中なので、この作業が終わってから行う
    this.reserved.set(chatId, [...(this.reserved.get(chatId) ?? []), { action, targetId }]);
    if (!runner.isBusy(chatId)) this.schedule();
    return [
      `予約しました。このチャットの作業が終わったら、Kickoff が${label}${withOthers(family.length - 1)}を${ACTION_LABELS[action]}します。`,
      action === "archive" ? "利用者はサイドバーのアーカイブから戻せます。" : "3 日間はプロジェクトの「ゴミ箱」タブから戻せます。",
      "送信待ちが残っていれば止めておきます。予約したら、結果を返答で伝えて作業を終えてください。",
    ].join("\n");
  }

  /** 一緒に扱うチャット（子孫も。アーカイブなら、もうアーカイブしてあるものは数えない） */
  private familyOf(action: RemoveAction, target: Chat): Chat[] {
    const family = [target, ...this.deps.store.chats.descendants(target.id)];
    return action === "archive" ? family.filter((c) => c.archived_at === null) : family;
  }

  /** その場で行う（作業中のものがあれば Conflict）。AI に返す文を返す */
  private perform(action: RemoveAction, target: Chat, byChatId: number): string {
    const { store, runner, trashBin } = this.deps;
    const others = withOthers(this.familyOf(action, target).length - 1);
    const label = `チャット「${nameOf(target)}」（ID ${target.id}）`;
    if (action === "archive") {
      // 子孫ごとしまう（作業中のものがあれば断る。決まりは PATCH /api/chats/:id と同じ update.ts）
      archiveChatFamily({ store, requireIdle: (id, why) => runner.requireIdle(id, why) }, target);
      return `${label}${others}をアーカイブしました。利用者はサイドバーのアーカイブから戻せます。`;
    }
    trashChat({ store, trashBin, runner }, target, { byChatId });
    return `${label}${others}を Kickoff のゴミ箱に入れました。3 日間はプロジェクトの「ゴミ箱」タブから戻せます。`;
  }

  /** 予約を確かめる（少し待ってから。頼んだチャットの作業の後始末が済むまで） */
  private schedule(delay = 0) {
    if (this.timer) return;
    this.timer = (this.deps.clock ?? systemClock).setTimeout(() => {
      this.timer = null;
      this.runReserved();
    }, delay);
  }

  /** 予約のうち、頼んだチャットと一緒に扱うチャットがどれも作業中でなくなったものを行い、結果を頼んだチャットのお知らせに残す */
  private runReserved() {
    const { store, runner } = this.deps;
    let waiting = false;
    for (const [chatId, list] of [...this.reserved]) {
      const chat = store.chats.get(chatId);
      if (!chat) {
        this.reserved.delete(chatId);
        continue;
      }
      // 作業の終わりの知らせは、作業の後始末より先に届くので、作業中でなくなるまで待つ（送る準備・作業の終わりにすることの間は終わりの知らせが来ないので、少し待って確かめ直す）
      if (runner.isBusy(chatId)) {
        const { phase } = runner.live(chatId);
        waiting ||= phase === "preparing" || phase === "settling";
        continue;
      }
      const rest: Reservation[] = [];
      for (const r of list) {
        const target = store.chats.get(r.targetId);
        // 利用者が先にアーカイブした・消したなら、することはない
        if (!target || (r.action === "archive" && target.archived_at !== null)) continue;
        if (this.familyOf(r.action, target).some((c) => runner.isBusy(c.id))) {
          rest.push(r);
          continue;
        }
        try {
          const text = this.perform(r.action, target, chatId);
          // 消したチャットには残さない（ゴミ箱から戻したときに見える所がないため、残すのはアーカイブだけ）
          if (r.action === "archive" && store.chats.get(chatId)) store.events.add(chatId, { type: "notice", message: `予約どおり、${text}` });
        } catch (e) {
          store.events.add(chatId, { type: "notice", message: `予約した${ACTION_LABELS[r.action]}ができませんでした: ${errorMessage(e)}` });
        }
      }
      if (rest.length > 0) this.reserved.set(chatId, rest);
      else this.reserved.delete(chatId);
    }
    if (waiting) this.schedule(this.deps.retryMs ?? 200);
  }
}

