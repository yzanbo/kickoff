// サブエージェントの手順に使う記録だけを選ぶ（流れの中のカード・右の欄の画面）。
// カードごとに読み込んだ記録の全体をたどらないよう、記録の配列ごとに 1 回だけ索引（流れ = parent ごとの位置）を作り、
// カードはそのサブエージェントの流れの分と、どの流れの項目にも要る分だけを ID の順に取り出して groupEvents に渡す
import type { ChatEvent } from "@shared/chat/chatEvent";
import { isBackgroundLaunch } from "@shared/chat/backgroundTasks";
import { isRelayMessage, relayedText } from "@shared/chat/prompts";
import { createLruMap } from "@/foundation/ui/lib/lruMap";

/** 読み込んだ記録の索引（位置の列はどれも小さい順） */
interface LoadedIndex {
  /** 流れ（サブエージェントを起動した呼び出し ID）ごとの、中の記録の位置 */
  byParent: Map<string, number[]>;
  /**
   * どの流れの項目にも要る記録の位置: サブエージェントの知らせ（裏で動かしたものの終わりの 1 行）と、裏で起動したという結果
   * （groupEvents が流れによらず数える）
   */
  shared: number[];
}

/** 記録の配列ごとの索引（記録が届くたびに配列が替わるので、同じ配列を読む間だけ覚える） */
const indexes = new WeakMap<readonly ChatEvent[], LoadedIndex>();

function indexOf(loaded: readonly ChatEvent[]): LoadedIndex {
  const cached = indexes.get(loaded);
  if (cached) return cached;
  const byParent = new Map<string, number[]>();
  const shared: number[] = [];
  for (let i = 0; i < loaded.length; i++) {
    const e = loaded[i];
    if (e.type === "subagent") {
      shared.push(i);
      continue;
    }
    if (e.type === "user") continue;
    const parent = "parent" in e.data ? e.data.parent : undefined;
    if (e.type === "tool_result" && isBackgroundLaunch(e.data.content)) {
      // 流れの中の記録でもあるものは、流れの位置の列に入れるので重ねない
      if (parent === undefined) shared.push(i);
    }
    if (parent === undefined) continue;
    const list = byParent.get(parent);
    if (list) list.push(i);
    else byParent.set(parent, [i]);
  }
  const index = { byParent, shared };
  indexes.set(loaded, index);
  return index;
}

/**
 * チャット欄・右の欄から伝えた追加の指示（自分の発言）。末尾より前のものも要る（末尾より前に起動したサブエージェントの画面に、そのころ伝えた指示を出す）ので、
 * 読み込んだ記録ではなく digest（索引は自分の発言を中身のまま持つ）から、配列ごとに 1 回だけ拾う
 */
const relayLists = new WeakMap<readonly ChatEvent[], ChatEvent[]>();

function relaysOf(digest: readonly ChatEvent[]): ChatEvent[] {
  let list = relayLists.get(digest);
  if (!list) relayLists.set(digest, (list = digest.filter((e) => e.type === "user" && isRelayMessage(e.data.text))));
  return list;
}

/** 伝えた指示を、伝えた先のサブエージェントの流れの自分の発言にしたもの（同じ記録・同じ行なら同じ物。カードの memo が効くように） */
const relayed = new WeakMap<ChatEvent, Map<string, ChatEvent | null>>();

function relayFor(e: ChatEvent, agentId: string, key: string): ChatEvent | null {
  if (e.type !== "user") return null;
  let byAgent = relayed.get(e);
  if (!byAgent) relayed.set(e, (byAgent = new Map()));
  const k = `${agentId} ${key}`;
  let out = byAgent.get(k);
  if (out === undefined) {
    const text = relayedText(e.data.text, agentId);
    out = text === undefined ? null : ({ ...e, data: { ...e.data, text, parent: key } } as ChatEvent);
    byAgent.set(k, out);
  }
  return out;
}

/** 前に返した並び（流れごと。中身が同じなら前の配列を返し、カードの項目を作り直さない） */
const lastResults = createLruMap<string, ChatEvent[]>(500);

/**
 * そのサブエージェントの手順に使う記録（ID の順）。scope は流れ（行のキーと、再開した回の呼び出し ID）、agentId があれば
 * そのサブエージェントへ伝えた指示（digest から。末尾より前のものも）を key の流れの自分の発言として混ぜる。groupEvents(結果, scope) は、
 * 読み込んだ記録の全体を渡したときと同じ項目になる（conversation の ui/timeline/subagentEvents.test.ts）。中身が前と同じなら前と同じ配列を返す
 */
export function subagentEvents(loaded: readonly ChatEvent[], digest: readonly ChatEvent[], scope: readonly string[], key: string, agentId: string | undefined): ChatEvent[] {
  const index = indexOf(loaded);
  const lists: number[][] = [index.shared];
  for (const parent of scope) {
    const list = index.byParent.get(parent);
    if (list) lists.push(list);
  }
  const positions = mergeSorted(lists);
  const picked: ChatEvent[] = [];
  let r = 0;
  const relays = agentId ? relaysOf(digest) : [];
  for (const p of positions) {
    const e = loaded[p];
    for (; r < relays.length && relays[r].id < e.id; r++) pushRelay(picked, relays[r], agentId!, key);
    picked.push(e);
  }
  for (; r < relays.length; r++) pushRelay(picked, relays[r], agentId!, key);
  const memoKey = `${scope.join(" ")}|${key}|${agentId ?? ""}`;
  const prev = lastResults.get(memoKey);
  if (prev && prev.length === picked.length && prev.every((e, i) => e === picked[i])) return prev;
  lastResults.set(memoKey, picked);
  return picked;
}

function pushRelay(out: ChatEvent[], e: ChatEvent, agentId: string, key: string) {
  const mixed = relayFor(e, agentId, key);
  if (mixed) out.push(mixed);
}

/** 小さい順の位置の列をいくつか重ねる（重なりは 1 つに） */
function mergeSorted(lists: number[][]): number[] {
  const nonEmpty = lists.filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return [];
  if (nonEmpty.length === 1) return nonEmpty[0];
  const out = nonEmpty.flat().sort((a, b) => a - b);
  return out.filter((p, i) => i === 0 || out[i - 1] !== p);
}
