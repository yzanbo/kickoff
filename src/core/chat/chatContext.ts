// AI に伝える「このチャット」の文脈: 自分の名前と ID、子チャットなら親までの系譜と、親の会話のどこで聞いたか、子チャットがあればその一覧（孫も）。
// AI からは Kickoff のチャットが見えない（分かるのは Claude Code のセッションだけ）ので、「親チャットはどれ？」「子チャットはどれ？」に答えられるように渡す
import { childDepthLabel } from "@shared/chat/childDepth";
import type { Chat, ChatEvent, ChatStatus } from "@shared/types";
import type { Store } from "../db/store.js";

/** 系譜の 1 つ（親・祖先のチャット） */
export interface ChatLineageEntry {
  id: number;
  title: string;
  /** Claude Code のセッション ID（まだ動いていなければ null） */
  sessionId: string | null;
}

/** このチャットの子孫（子・孫…）の 1 つ */
export interface ChatChildEntry extends ChatLineageEntry {
  /** このチャットから何段下か（1 = 子・2 = 孫） */
  depth: number;
  /** 親（子ならこのチャット、孫ならその親の子チャット）の ID */
  parentId: number;
  status: ChatStatus;
  archived: boolean;
  /** 親の会話で聞いた位置の書き出し（分からなければ null） */
  askedFrom: string | null;
}

export interface ChatContext {
  id: number;
  title: string;
  /** 親から根までの系譜（根 → 親の順。親のないチャットは空） */
  ancestors: ChatLineageEntry[];
  /** 親の会話で聞いた位置の発言・返答の書き出し（分からなければ null） */
  askedFrom: string | null;
  /** 子孫（作った順に、子のすぐ下にその子を並べる。多ければ MAX_CHILDREN まで） */
  children: ChatChildEntry[];
  /** 上限を超えて載せなかった子孫の数 */
  moreChildren: number;
}

/** 系譜をたどる深さの上限（親子が輪になっていても止まるように） */
const MAX_DEPTH = 20;
/** 聞いた位置の書き出しの長さ */
const EXCERPT_LENGTH = 160;
/** 指示に載せる子孫の数の上限（指示を膨らませすぎない） */
const MAX_CHILDREN = 30;
/** 子チャットの状態の呼び名（AI に伝える文） */
const STATUS_TEXT: Record<ChatStatus, string> = { running: "作業中", completed: "終わった", failed: "失敗", cancelled: "止めた" };

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
  const all = childrenTree(store, chat);
  const children = all.slice(0, MAX_CHILDREN);
  return { id: chat.id, title: chat.title, ancestors, askedFrom: askedFromOf(store, chat), children, moreChildren: all.length - children.length };
}

/** 親の会話で聞いた位置の書き出し（親のものでない記録（親を付け替えたなど）は使わない） */
function askedFromOf(store: Store, chat: Chat): string | null {
  const askedEvent = chat.parent_event_id !== null ? store.events.get(chat.parent_event_id) : null;
  return askedEvent && askedEvent.chat_id === chat.parent_chat_id ? excerptOf(askedEvent) : null;
}

/** 子孫を、作った順に、子のすぐ下にその子を並べた一覧にする（アーカイブ済みも含める） */
function childrenTree(store: Store, chat: Chat): ChatChildEntry[] {
  const byParent = new Map<number, Chat[]>();
  for (const c of store.chats.descendants(chat.id)) {
    if (c.parent_chat_id === null) continue;
    byParent.set(c.parent_chat_id, [...(byParent.get(c.parent_chat_id) ?? []), c]);
  }
  const out: ChatChildEntry[] = [];
  const walk = (parentId: number, depth: number) => {
    if (depth > MAX_DEPTH) return;
    for (const c of (byParent.get(parentId) ?? []).sort((a, b) => a.id - b.id)) {
      out.push({
        id: c.id,
        title: c.title,
        sessionId: c.session_id,
        depth,
        parentId,
        status: c.status,
        archived: c.archived_at !== null,
        askedFrom: askedFromOf(store, c),
      });
      walk(c.id, depth + 1);
    }
  };
  walk(chat.id, 1);
  return out;
}

/**
 * 指示に添える文脈の文（親も子もないチャットは null）。
 * AI からは Kickoff のチャットが見えないので、自分と親・子を名前と ID で伝える（「親チャットはどれ？」「子チャットはどれ？」に答えられるように）
 */
export function chatContextNote(chat: ChatContext): string | null {
  const parent = chat.ancestors.at(-1);
  if (!parent && chat.children.length === 0) return null;
  // 根のチャットから何段目か（0 = 根・1 = 子・2 = 孫）
  const depth = chat.ancestors.length;
  const lines = [`Kickoff からの文脈（利用者の発言ではありません）:`];
  if (parent) {
    const session = parent.sessionId ? `、Claude Code のセッション ID: ${parent.sessionId}` : "";
    lines.push(
      `- このチャット: 「${chatName(chat.title)}」（Kickoff のチャット ID: ${chat.id}）。親チャットから寄り道の質問をするために作った${childDepthLabel(depth)}です。`,
      `- 親チャット: 「${chatName(parent.title)}」（Kickoff のチャット ID: ${parent.id}${session}${depth > 1 ? `。親チャットも${childDepthLabel(depth - 1)}です` : ""}）`,
    );
    if (chat.ancestors.length > 1) {
      lines.push(`- 親までの系譜（根から順に）: ${[...chat.ancestors.map((a) => `「${chatName(a.title)}」（ID: ${a.id}）`), "このチャット"].join(" › ")}`);
    }
    if (chat.askedFrom) lines.push(`- 親チャットの会話のこの発言から聞きました: 「${chat.askedFrom}」`);
    lines.push(
      `- 親チャットの会話を引き継いで始めたときは、このセッションの初めのほうは親チャットの会話を写したものです（このチャットは親チャットそのものではありません）。利用者が「親」「親チャット」と言ったら、上の親チャットのことです。`,
      `- 作業場所は親チャットと同じです。答えは、利用者が自分で選んで親チャットに渡します（画面の「親チャットに渡す」）。`,
    );
  } else {
    lines.push(`- このチャット: 「${chatName(chat.title)}」（Kickoff のチャット ID: ${chat.id}）。親のないチャットです。`);
  }
  if (chat.children.length > 0) lines.push(...childrenLines(chat));
  return lines.join("\n");
}

/** 子孫の一覧の行（子のすぐ下に、その子を字下げして並べる） */
function childrenLines(chat: ChatContext): string[] {
  const lines = [
    `- このチャットから作った子チャット（利用者がこのチャットの横で寄り道の質問をするために作ったチャット。作業場所は同じ。作った順。利用者が「子チャット」「孫チャット」と言ったら、この中のチャットのことです）:`,
  ];
  for (const c of chat.children) {
    const facts = [
      `Kickoff のチャット ID: ${c.id}`,
      ...(c.sessionId ? [`Claude Code のセッション ID: ${c.sessionId}`] : []),
      `状態: ${STATUS_TEXT[c.status]}${c.archived ? "・アーカイブ済み" : ""}`,
    ];
    const asked = c.askedFrom ? `。${c.depth === 1 ? "このチャット" : "親"}の会話のこの発言から聞いた: 「${c.askedFrom}」` : "";
    lines.push(`${"  ".repeat(c.depth)}- ${childDepthLabel(chat.ancestors.length + c.depth)}「${chatName(c.title)}」（${facts.join("、")}${asked}）`);
  }
  if (chat.moreChildren > 0) lines.push(`  - ほか ${chat.moreChildren} 件（多いので、作った順の初めから載せています）`);
  return lines;
}
