import { useEffect, useRef, useState } from "react";
import { chatLog, chatWindow, timelineView } from "@/features/chat/ui";
import type { ChatShellHandles } from "@/features/conversation/ui/screen/useChatShell";
import { promptList } from "@/features/conversation/ui/promptList/selectors";
import { usePromptKeys } from "@/features/conversation/ui/promptList/usePromptKeys";
import { timelineItems } from "./selectors";
import { useTimelineWindow } from "./useTimelineWindow";

/**
 * 会話の流れの窓と、指示のキー（⌘⌥↑ / ↓）・検索から開いた発言の読み込み・遠い記録を読んだあとの続き。
 * 流れに出すのは末尾（遠い発言へ移ったときは途中の一部分）で、最近の項目だけを描く（長いチャットでも軽くする。検索・移り先は、その前後だけを描く）
 */
export function useConversationTimeline(chatId: number, focus: number | undefined, shell: ChatShellHandles) {
  const { scroll } = shell;
  // 流れに出す記録の範囲と読み足しの様子（記録の配列は読まず、要るものを取り出し口で読む）
  const log = chatWindow.useFor(chatId);
  const items = timelineItems.useFor(chatId);
  // 自分の指示の一覧（指示の履歴・⌘⌥↑ / ↓・上に貼り付ける指示の帯・チャット欄の ↑ の呼び出し。記録全体から作る取り出し口）
  const prompts = promptList.useFor(chatId);
  // 開き直したとき: 前に読んでいた位置があり、そのあと新しい項目が届いていなければ、その位置から（届いていれば一番下。検索から開いたらその発言）
  const [initial] = useState(() => {
    const saved = timelineView(chatId).position;
    if (focus !== undefined || !saved || items.at(-1)?.key !== saved.last) return null;
    // 一番下へ付いていかないところから始める（付いていくと、最初の大きさの知らせで一番下へ寄せる）
    scroll.release();
    return { key: saved.key, offset: saved.offset };
  });
  const timeline = useTimelineWindow({
    items,
    chatId,
    scroll,
    log: { hasEarlier: log.hasEarlier, focused: log.focused, paging: log.paging },
    initial,
    onDrawn: () => shell.timeline.drawn.set((n) => n + 1),
  });
  // 検索結果から開いた発言を読んでいなければ、その前後を読む（読めたら窓がその前後を描く）。発言ごとに 1 回だけ
  // （隠したタブを表に戻すと effect が流れ直すので、末尾に戻ったあとに引き戻さない）
  const openedFocus = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (focus === undefined || openedFocus.current === focus) return;
    openedFocus.current = focus;
    if (!chatLog.shows(chatId, focus)) void chatLog.openAround(chatId, focus);
  }, [chatId, focus]);
  // 遠い記録を読んだあと、流れに出たら続きをする（openAround のあとに移る・描く）
  const [afterShow, setAfterShow] = useState<{ eventId: number; then: () => void } | null>(null);
  useEffect(() => {
    if (!afterShow) return;
    const { shown: range } = log;
    const shown = range !== null && (log.focused ? afterShow.eventId >= range.first && afterShow.eventId <= range.last : afterShow.eventId >= log.tailStart);
    if (!shown) return;
    setAfterShow(null);
    afterShow.then();
  }, [afterShow, log]);
  // ⌘⌥↑ / ↓ で前後の指示へ（上に貼り付けた指示の帯の ↑ / ↓ も）
  // 指示の位置は、描いていない行も窓の前からの和で（箱の中の指示を見落とさない）。読み込んでいない範囲の指示は記録の順で前後を決める
  const loaded = log.shown ? { first: log.shown.first, last: log.focused ? log.shown.last : Number.MAX_SAFE_INTEGER } : null;
  const promptKeys = usePromptKeys({
    root: shell.ports.root,
    timeline: scroll.ref,
    promptIds: prompts.ids,
    locate: (id) => timeline.topOf(`e${id}`),
    loaded,
    onJump: (id) => shell.timeline.jumpTo(id),
  });
  /** 口に入れる描いた値（窓で移る・指示へ移る・遠い記録を読んだあとの続き） */
  const windowPort = { revealEvent: timeline.revealEvent, stepPrompt: promptKeys.go, showAfter: (eventId: number, then: () => void) => setAfterShow({ eventId, then }) };
  return { timeline, prompts, windowPort };
}
