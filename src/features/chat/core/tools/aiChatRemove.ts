// チャットの AI がチャットをアーカイブする・消す（kickoff_chat の archive_chat・delete_chat の中身。プロバイダーに依らない）。
// 使うのは利用者が頼んだときだけ（ツールの説明で伝える）。どちらも戻せる（アーカイブは画面から戻せ、削除は Kickoff のゴミ箱に 3 日）ので承認は聞かない。
// 相手は同じプロジェクトのチャット（家系に依らない）で、子孫も一緒（画面のアーカイブ・削除と同じ）。作業中のチャットが含まれていれば断る。
// ただし、作業中なのがツールを呼んだチャット自身だけ（自分・自分の祖先を頼まれた）なら、その作業が終わってから行う（作業の終わりの予約 reserveAtTurnEnd。送信待ちは止めておく）
import type { TurnEndTask } from "@/features/chat/core/turnEnd";
import { errorMessage } from "@shared/foundation/errors";
import { chatName, type Chat } from "@shared/chat/types";
import type { Store } from "@/features/chat/core/stores";
import type { TrashApi } from "@/features/trash/core/index";
import { toolChat } from "./context";
import { descendantsOf } from "@/features/chat/core/family";
import { archiveChatFamily } from "@/features/chat/core/update";
import { trashChat } from "@/features/chat/core/sessions/chatTrash";

/** アーカイブか削除か */
export type RemoveAction = "archive" | "delete";

const ACTION_LABELS: Record<RemoveAction, string> = { archive: "アーカイブ", delete: "削除" };

export interface ChatRemoverDeps {
  store: Store;
  /** チャットの実行の殻（作業中か・作業中の状態を捨てる・作業の終わりの予約） */
  runner: { isBusy(chatId: number): boolean; requireIdle(chatId: number, action: string): void; forget(chatId: number): void; reserveAtTurnEnd(chatId: number, task: TurnEndTask): void };
  trashBin: Pick<TrashApi, "addRecord">;
}

/** 一緒に扱う子孫の数の添え書き */
const withOthers = (count: number) => (count > 0 ? `（子チャットなど ${count} 件も一緒に）` : "");

export class ChatRemover {
  constructor(private readonly deps: ChatRemoverDeps) {}

  /**
   * AI の archive_chat・delete_chat。chatId のチャットの AI が targetId のチャットをアーカイブする・消す。
   * AI に返す文を返す（できなければ理由の文で throw）
   */
  fromChat(chatId: number, action: RemoveAction, targetId: number): string {
    const { store, runner } = this.deps;
    const { self: selfChat, chatInProject } = toolChat(store.chats, chatId);
    const self = selfChat();
    const target = chatInProject(self, targetId, "list_project_chats・list_family_chats で ID を確かめてください");
    const label = `チャット「${chatName(target, "ui")}」（ID ${target.id}）`;
    if (action === "archive" && target.archived_at !== null) return `${label}は、もうアーカイブしてあります。`;
    const family = this.familyOf(action, target);
    const busy = family.filter((c) => c.id !== chatId && runner.isBusy(c.id));
    if (busy.length > 0) {
      throw new Error(
        `作業中のチャット（${busy.map((c) => `「${chatName(c, "ui")}」`).join("・")}）が含まれているので${ACTION_LABELS[action]}できません（待たずに断りました）。作業が終わってから、もう一度頼んでください`,
      );
    }
    if (!family.some((c) => c.id === chatId)) return this.perform(action, target, chatId);
    // 自分（自分の祖先なら子孫の自分も）は作業中なので、この作業が終わってから行う（行う前に送信待ちを止める = アーカイブ・削除するつもりのチャットで次の指示が勝手に動かないように）
    runner.reserveAtTurnEnd(chatId, { kind: action === "archive" ? "archive_chat" : "delete_chat", key: String(targetId), order: 30, label: `${label}の${ACTION_LABELS[action]}`, when: "any", pauseQueue: true, run: async () => this.runReserved(chatId, action, targetId) });
    return [
      `予約しました。このチャットの作業が終わったら、Kickoff が${label}${withOthers(family.length - 1)}を${ACTION_LABELS[action]}します。`,
      action === "archive" ? "利用者はサイドバーのアーカイブから戻せます。" : "3 日間はプロジェクトの「ゴミ箱」タブから戻せます。",
      "送信待ちが残っていれば止めておきます。予約したら、結果を返答で伝えて作業を終えてください。",
    ].join("\n");
  }

  /** 一緒に扱うチャット（子孫も。アーカイブなら、もうアーカイブしてあるものは数えない） */
  private familyOf(action: RemoveAction, target: Chat): Chat[] {
    const family = [target, ...descendantsOf(this.deps.store.chats, target.id)];
    return action === "archive" ? family.filter((c) => c.archived_at === null) : family;
  }

  /** その場で行う（作業中のものがあれば Conflict）。AI に返す文を返す */
  private perform(action: RemoveAction, target: Chat, byChatId: number): string {
    const { store, runner, trashBin } = this.deps;
    const others = withOthers(this.familyOf(action, target).length - 1);
    const label = `チャット「${chatName(target, "ui")}」（ID ${target.id}）`;
    if (action === "archive") {
      // 子孫ごとしまう（作業中のものがあれば断る。決まりは PATCH /api/chats/:id と同じ update.ts）
      archiveChatFamily({ store, requireIdle: (id, why) => runner.requireIdle(id, why) }, target);
      return `${label}${others}をアーカイブしました。利用者はサイドバーのアーカイブから戻せます。`;
    }
    trashChat({ store, trashBin, runner }, target, { byChatId });
    return `${label}${others}を Kickoff のゴミ箱に入れました。3 日間はプロジェクトの「ゴミ箱」タブから戻せます。`;
  }

  /** 予約を行う（頼んだチャットと一緒に扱うチャットがどれも作業中でなくなったら。結果は頼んだチャットのお知らせに残す） */
  private runReserved(chatId: number, action: RemoveAction, targetId: number): "done" | "wait" {
    const { store, runner } = this.deps;
    if (!store.chats.get(chatId)) return "done";
    // 作業の終わりの知らせは、作業の後始末より先に届くので、作業中でなくなるまで待つ
    if (runner.isBusy(chatId)) return "wait";
    const target = store.chats.get(targetId);
    // 利用者が先にアーカイブした・消したなら、することはない
    if (!target || (action === "archive" && target.archived_at !== null)) return "done";
    if (this.familyOf(action, target).some((c) => runner.isBusy(c.id))) return "wait";
    try {
      const text = this.perform(action, target, chatId);
      // 消したチャットには残さない（ゴミ箱から戻したときに見える所がないため、残すのはアーカイブだけ）
      if (action === "archive" && store.chats.get(chatId)) store.events.add(chatId, { type: "notice", message: `予約どおり、${text}` });
    } catch (e) {
      store.events.add(chatId, { type: "notice", message: `予約した${ACTION_LABELS[action]}ができませんでした: ${errorMessage(e)}` });
    }
    return "done";
  }
}
