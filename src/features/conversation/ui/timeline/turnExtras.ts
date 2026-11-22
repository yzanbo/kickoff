// 流れの項目に載せないで、記録から別に作るもの: 作業の終わりの付け足し（作業時間・返答のコピー・変更カード・親へ渡すもの）と、発言の作業で AI が作ったチャット
import type { ChatEvent, ChatEventOf } from "@shared/chat/chatEvent";
import { isEditTool } from "@shared/ai/claudeTools";
import { lastReplyBefore } from "@shared/chat/handoff";
import { createdChatIdOf, isCreateChatTool, relationOf } from "@shared/chat/aiCreateChat";
import { changesOf, type EditCall, type FileChange } from "@/features/conversation/ui/tools/turnFileChanges";
import { parentOf } from "./timelineItems";

/**
 * 作業の終わりの、親チャットに渡すもの。reply: その作業の最後の返答（途中の「確認します」・サブエージェントの文は入れない。lastReplyBefore）、
 * requested: 親への依頼文を頼んだ作業か（頼みの発言 handoff_request に答えた作業。渡すボタンを目立たせる）
 */
export interface TurnHandoff {
  reply: string;
  requested: boolean;
}

/**
 * 作業の終わり（result）に付けるもの。start: その作業を始めた時刻（直前の自分の発言の時刻。作業時間を出すため）、
 * text: その作業での AI の返答をつないだ文（コピーのボタンに使う）、changes: その作業で変えたファイル（ターンの変更カード）、
 * handoff: 親チャットに渡すもの（子チャットの「親チャットに追加」）、handoffs: その作業の返答を親チャットに渡した記録（渡した順。渡したことの印）
 */
export interface TurnExtras {
  start?: string;
  text?: string;
  changes?: FileChange[];
  handoff?: TurnHandoff;
  handoffs?: ChatEventOf<"handoff">[];
}

export interface TurnExtrasOptions {
  /** 最初の作業の頭を読んでいない（大きすぎるターンを途中から読んだ）。その作業の終わりには付けない（作業全体から作るため） */
  partialHead?: boolean;
  /**
   * 前の回の答え。終わった作業の付け足しは変わらないので前の物を使い（変更カードを数え直さない・memo した終わりの行を描き直させない）、
   * 渡した記録だけ、増えたら新しくする
   */
  prev?: ReadonlyMap<number, TurnExtras>;
}

/** 渡した記録を作業の終わりの記録の ID ごとに（渡した記録は作業の終わりより後ろに付くので、先にまとめる） */
function handoffsByTurn(events: readonly ChatEvent[]): Map<number, ChatEventOf<"handoff">[]> {
  const byTurn = new Map<number, ChatEventOf<"handoff">[]>();
  for (const e of events) {
    if (e.type !== "handoff") continue;
    const list = byTurn.get(e.data.turn_event_id);
    if (list) list.push(e);
    else byTurn.set(e.data.turn_event_id, [e]);
  }
  return byTurn;
}

/** 渡した記録が同じか（記録は後ろに足すだけなので、数と最後で比べる） */
const sameHandoffs = (a: readonly ChatEvent[] | undefined, b: readonly ChatEvent[] | undefined) => a === b || (a !== undefined && b !== undefined && a.length === b.length && a.at(-1) === b.at(-1));

/** 作業の終わりの記録の ID → 付け足し（メインの流れの作業だけ。付けるものがない作業の終わりは入れない） */
export function turnExtrasOf(events: readonly ChatEvent[], opts: TurnExtrasOptions = {}): ReadonlyMap<number, TurnExtras> {
  const out = new Map<number, TurnExtras>();
  const handoffs = handoffsByTurn(events);
  let start: string | undefined;
  let texts: string[] = [];
  // その作業に、親への依頼文の頼みの発言があったか
  let requested = false;
  // その作業の編集のツール（サブエージェントのものも含める）
  let edits = new Map<string, EditCall>();
  // 頭を読んでいない最初の作業の終わり（その作業全体から作るものを付けない）
  let partial = opts.partialHead === true;
  for (const [index, e] of events.entries()) {
    if (e.type === "tool_use" && isEditTool(e.data.name)) edits.set(e.data.id, { use: e });
    else if (e.type === "tool_result" && edits.has(e.data.tool_use_id)) edits.get(e.data.tool_use_id)!.result = e;
    if (e.type === "subagent" || parentOf(e) !== undefined) continue;
    if (e.type === "user") {
      start ??= e.created_at;
      if (e.data.handoff_request) requested = true;
    } else if (e.type === "text") texts.push(e.data.text);
    else if (e.type === "result") {
      if (partial) partial = false;
      else {
        const extras = extrasOf(e, opts.prev?.get(e.id), handoffs.get(e.id), () => {
          const text = texts.join("\n\n");
          const changes = changesOf([...edits.values()]);
          const reply = lastReplyBefore(events, index);
          return {
            ...(start ? { start } : {}),
            ...(text ? { text } : {}),
            ...(changes.length ? { changes } : {}),
            ...(reply !== null ? { handoff: { reply, requested } } : {}),
          };
        });
        if (extras) out.set(e.id, extras);
      }
      start = undefined;
      texts = [];
      requested = false;
      edits = new Map();
    }
  }
  return out;
}

/** 作業の終わり 1 つの付け足し（前の回の物があれば渡した記録だけ見直す。何もなければ undefined） */
function extrasOf(end: ChatEvent, prev: TurnExtras | undefined, handoffs: ChatEventOf<"handoff">[] | undefined, make: () => TurnExtras): TurnExtras | undefined {
  if (prev && sameHandoffs(prev.handoffs, handoffs)) return prev;
  const { handoffs: _old, ...base } = prev ?? make();
  const extras: TurnExtras = handoffs ? { ...base, handoffs } : base;
  return Object.keys(extras).length > 0 ? extras : undefined;
}

/**
 * 自分の発言ごとの、その作業で AI が create_chat で作った兄弟チャット・親のないチャット（メインの流れの呼び出しで、作れたものだけ。発言の記録の ID → チャットの ID の列）。
 * 子チャットは聞いた位置（parent_event_id）で発言の下に札が出るので除く
 */
export function createdChatsByUser(events: readonly ChatEvent[]): Map<number, number[]> {
  const created = new Map<number, number[]>();
  const callOwner = new Map<string, number>();
  let lastUser: number | null = null;
  for (const e of events) {
    if (e.type === "user") lastUser = e.id;
    else if (e.type === "tool_use" && e.data.parent === undefined && lastUser !== null && isCreateChatTool(e.data.name)) {
      const input = e.data.input && typeof e.data.input === "object" ? (e.data.input as Record<string, unknown>) : {};
      if (relationOf(input) !== "child") callOwner.set(e.data.id, lastUser);
    } else if (e.type === "tool_result" && !e.data.is_error && callOwner.has(e.data.tool_use_id)) {
      const id = createdChatIdOf(e.data.content);
      const owner = callOwner.get(e.data.tool_use_id)!;
      if (id !== null) created.set(owner, [...(created.get(owner) ?? []), id]);
    }
  }
  return created;
}
