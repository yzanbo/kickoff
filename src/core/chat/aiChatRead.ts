// チャットの AI が読むだけのツール（kickoff_chat の list_project_chats・read_chat・get_usage の中身。プロバイダーに依らない）。
// 同じプロジェクトのチャットの一覧と会話、使用枠の残りを返す。読むだけで何も変えないので、聞かずに返す（権限モード・Auto mode によらず承認カードを出さない）。
// ほかのプロジェクトのチャットは読めない
import { LIST_PROJECT_CHATS_MAX, READ_CHAT_DEFAULT_TURNS, READ_CHAT_MAX_TURNS, type ReadChatInput } from "@shared/chat/aiRead";
import type { Chat, PlanUsage, UsageWindow } from "@shared/types";
import type { Store } from "../db/store.js";
import type { ApprovalCenter } from "./approvals.js";
import { familyOf } from "./aiChatEdit.js";
import { conversationTurns, formatConversation } from "./conversation.js";

/** 読むだけのツールの中身（AI に返す文。読めなければ理由の文で throw） */
export interface AiChatReadTools {
  listProjectChats(): string;
  readChat(input: ReadChatInput): string;
  usage(): Promise<string>;
}

export interface AiChatReadDeps {
  store: Store;
  approvals: ApprovalCenter;
  /** Claude のプランの使用枠（なければ get_usage は使えないと返す） */
  usage?: { get(): Promise<PlanUsage> };
}

/** 文の中の名前（空なら「名前なし」） */
const nameOf = (title: string) => title.trim() || "（名前なし）";

/** チャットの状態の言葉（回答待ち → 作業中 → 失敗 → 止めた → 終わった。画面の状態と同じ順） */
export function chatStateText(chat: Chat, waiting: boolean): string {
  if (waiting) return "回答待ち";
  if (chat.status === "running") return "作業中";
  if (chat.status === "failed") return "失敗";
  if (chat.status === "cancelled") return "止めた";
  return "終わった";
}

/** 使用枠の 1 つの文（「5 時間: 42% 使用（残り 58%）・2026-11-13T15:00:00Z にリセット」） */
function windowText(w: UsageWindow): string {
  if (w.utilization === null) return `${w.label}: まだ始まっていません`;
  const used = Math.round(w.utilization);
  const reset = w.resets_at ? `・${w.resets_at} にリセット` : "";
  return `${w.label}: ${used}% 使用（残り ${Math.max(0, 100 - used)}%）${reset}${w.detail ? `（${w.detail}）` : ""}`;
}

/** 使用枠を AI に返す文にする */
export function usageText(u: PlanUsage): string {
  if (!u.available) return `${u.provider_label} のプランの使用枠は取得できません${u.error ? `（${u.error}）` : "（API キーで使っているなど）"}。`;
  const lines = [
    `${u.provider_label} のプランの使用枠（${u.fetched_at} に取得${u.plan ? `・プラン ${u.plan}` : ""}）:`,
    `- ${windowText(u.five_hour)}`,
    `- ${windowText(u.seven_day)}`,
    ...u.model_weekly.map((w) => `- ${windowText(w)}`),
  ];
  if (u.extra_usage?.enabled) lines.push(`- 追加の使用枠: オン${u.extra_usage.utilization === null ? "" : `（${Math.round(u.extra_usage.utilization)}% 使用）`}`);
  if (u.error) lines.push(`（最新の取得に失敗したため、前に取った値です: ${u.error}）`);
  return lines.join("\n");
}

/** chatId のチャットの AI に渡す、読むだけのツールの中身。チャットは呼ぶたびに引き直す */
export function createAiChatReadTools({ store, approvals, usage }: AiChatReadDeps, chatId: number): AiChatReadTools {
  const requireSelf = (): Chat => {
    const chat = store.chats.get(chatId);
    if (!chat) throw new Error("このチャットが見つかりません（消された可能性があります）");
    return chat;
  };
  /** 家系の中なら関係の呼び名、外なら「ほかの家系」 */
  const relations = (self: Chat) => {
    const { members, relationOf } = familyOf(store, self);
    const inFamily = new Set(members.map((m) => m.id));
    return (chat: Chat) => (inFamily.has(chat.id) ? relationOf(chat) : "ほかの家系");
  };
  return {
    listProjectChats() {
      const self = requireSelf();
      const relationOf = relations(self);
      const waiting = new Set(approvals.list({ projectId: self.project_id }).map((a) => a.chat_id));
      const all = store.chats.list({ projectId: self.project_id });
      const chats = all.slice(0, LIST_PROJECT_CHATS_MAX);
      return JSON.stringify(
        {
          self_id: self.id,
          chats: chats.map((c) => ({
            id: c.id,
            title: c.title,
            state: chatStateText(c, waiting.has(c.id)),
            unread: c.unread,
            relation: relationOf(c),
            parent_id: c.parent_chat_id,
            memo: c.memo_path,
            active_at: c.active_at,
          })),
          ...(all.length > chats.length ? { omitted: all.length - chats.length } : {}),
          note: "同じプロジェクトのアーカイブしていないチャット（子チャット・メモのチャットも）を、最後に動いた時刻の新しい順に並べた一覧。会話は read_chat で読める。",
        },
        null,
        2,
      );
    },
    readChat(input) {
      const self = requireSelf();
      const target = store.chats.get(input.chat_id);
      if (!target || target.project_id !== self.project_id) {
        throw new Error(`チャット ID ${input.chat_id} は、このプロジェクトにありません。読めるのは同じプロジェクトのチャットだけです。list_project_chats で ID を確かめてください`);
      }
      const count = Math.min(Math.max(1, Math.trunc(input.turns ?? READ_CHAT_DEFAULT_TURNS)), READ_CHAT_MAX_TURNS);
      const label = `チャット「${nameOf(target.title)}」（ID ${target.id}・${relations(self)(target)}・${chatStateText(target, approvals.list({ chatId: target.id }).length > 0)}${target.archived_at ? "・アーカイブ済み" : ""}）`;
      return formatConversation(label, conversationTurns(store.events.conversation(target.id)), count, input.before);
    },
    async usage() {
      if (!usage) throw new Error("使用枠を読む口がないため、使用枠の残りを返せません");
      return usageText(await usage.get());
    },
  };
}
