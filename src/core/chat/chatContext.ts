// AI に伝える「このチャット」の文脈: 自分の名前と ID、子チャットなら親までの系譜と、親の会話のどこで聞いたか。
// AI からは Kickoff のチャットが見えない（分かるのは Claude Code のセッションだけ）ので、「親チャットはどれ？」に答えられるように渡す
import type { Chat, ChatEvent } from "@shared/types";
import type { Store } from "../db/store.js";

/** 系譜の 1 つ（親・祖先のチャット） */
export interface ChatLineageEntry {
  id: number;
  title: string;
  /** Claude Code のセッション ID（まだ動いていなければ null） */
  sessionId: string | null;
}

export interface ChatContext {
  id: number;
  title: string;
  /** 親から根までの系譜（根 → 親の順。親のないチャットは空） */
  ancestors: ChatLineageEntry[];
  /** 親の会話で聞いた位置の発言・返答の書き出し（分からなければ null） */
  askedFrom: string | null;
}

/** 系譜をたどる深さの上限（親子が輪になっていても止まるように） */
const MAX_DEPTH = 20;
/** 聞いた位置の書き出しの長さ */
const EXCERPT_LENGTH = 160;

/** 名前（空なら「名前なし」） */
function chatName(title: string): string {
  return title.trim() || "（名前なし）";
}

/** 聞いた位置の記録の文の書き出し（1 行にして詰める。文のない記録は null） */
function excerptOf(event: ChatEvent | null): string | null {
  if (!event || (event.type !== "user" && event.type !== "text")) return null;
  const flat = event.data.text.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH)}…` : flat;
}

/** チャットの文脈（親の名前は送るたびに引き直すので、あとで名前を変えても次の指示から効く） */
export function chatContextOf(store: Store, chat: Chat): ChatContext {
  const ancestors: ChatLineageEntry[] = [];
  const seen = new Set([chat.id]);
  let parentId = chat.parent_chat_id;
  while (parentId !== null && !seen.has(parentId) && ancestors.length < MAX_DEPTH) {
    const parent = store.chats.get(parentId);
    if (!parent) break;
    seen.add(parent.id);
    ancestors.unshift({ id: parent.id, title: parent.title, sessionId: parent.session_id });
    parentId = parent.parent_chat_id;
  }
  const askedEvent = chat.parent_event_id !== null ? store.events.get(chat.parent_event_id) : null;
  // 親のものでない記録（親を付け替えたなど）は使わない
  const askedFrom = askedEvent && askedEvent.chat_id === chat.parent_chat_id ? excerptOf(askedEvent) : null;
  return { id: chat.id, title: chat.title, ancestors, askedFrom };
}

/**
 * 指示に添える文脈の文（親のないチャットは null。添えるのは子チャットだけ）。
 * AI からは Kickoff のチャットが見えないので、自分と親を名前と ID で伝える（「親チャットはどれ？」に答えられるように）
 */
export function chatContextNote(chat: ChatContext): string | null {
  const parent = chat.ancestors.at(-1);
  if (!parent) return null;
  const session = parent.sessionId ? `、Claude Code のセッション ID: ${parent.sessionId}` : "";
  const lines = [
    `Kickoff からの文脈（利用者の発言ではありません）:`,
    `- このチャット: 「${chatName(chat.title)}」（Kickoff のチャット ID: ${chat.id}）。親チャットから寄り道の質問をするために作った子チャットです。`,
    `- 親チャット: 「${chatName(parent.title)}」（Kickoff のチャット ID: ${parent.id}${session}）`,
  ];
  if (chat.ancestors.length > 1) {
    lines.push(`- 親までの系譜（根から順に）: ${[...chat.ancestors.map((a) => `「${chatName(a.title)}」（ID: ${a.id}）`), "このチャット"].join(" › ")}`);
  }
  if (chat.askedFrom) lines.push(`- 親チャットの会話のこの発言から聞きました: 「${chat.askedFrom}」`);
  lines.push(
    `- 親チャットの会話を引き継いで始めたときは、このセッションの初めのほうは親チャットの会話を写したものです（このチャットは親チャットそのものではありません）。利用者が「親」「親チャット」「メイン」と言ったら、上の親チャットのことです。`,
    `- 作業場所は親チャットと同じです。答えは、利用者が自分で選んで親チャットに渡します（画面の「メインに渡す」）。`,
  );
  return lines.join("\n");
}
