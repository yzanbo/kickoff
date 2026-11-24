import { useEffect, useMemo } from "react";
import type { ChatEvent } from "@shared/chat/chatEvent";
import type { SubagentEntry } from "@shared/chat/subagents";
import { chatLog } from "@/features/chat/ui";
import { subagentEvents } from "@/features/subagents/ui/model/subagentEvents";
import { scopeOf } from "@/features/subagents/ui/model/subagentTree";
import type { SubagentsView } from "./subagentsContext";

/** サブエージェントの手順の記録と流れ（項目にまとめて描くのは描く側の RenderScope） */
export type SubagentScope = { events: readonly ChatEvent[]; scope: readonly string[] };

/**
 * サブエージェントの手順の記録（そのサブエージェントの記録だけ）。チャット欄・右の欄の入力欄から伝えた
 * 追加の指示（メインのチャットの自分の発言）は、このサブエージェントの流れに自分の発言として混ぜる
 */
export function useSubagentScope(entry: SubagentEntry, view: SubagentsView): SubagentScope {
  const { key, agentId, toolUseEventId } = entry;
  const scopeKey = scopeOf(entry).join(" ");
  // 末尾より前に始まったサブエージェントは、中の記録を読む（索引には中の最後の動きしかない）
  const before = view.tailStart > 0 && toolUseEventId !== undefined && toolUseEventId < view.tailStart;
  const { chatId } = view;
  useEffect(() => {
    if (before) void chatLog.loadScope(chatId, scopeKey.split(" "), toolUseEventId === undefined ? [] : [toolUseEventId]);
  }, [before, chatId, scopeKey, toolUseEventId]);
  const scope = useMemo(() => scopeKey.split(" "), [scopeKey]);
  // そのサブエージェントの流れの記録だけを選ぶ（カードごとに読み込んだ記録の全体をたどらない）
  const events = useMemo(() => subagentEvents(view.loaded, view.events, scope, key, agentId), [view.loaded, view.events, scope, key, agentId]);
  return { events, scope };
}
