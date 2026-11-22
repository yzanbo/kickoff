// チャットの画面の殻が持つもの（口・画面の要素・流れのスクロール・入力欄・右の欄の口）を、チャットごとに 1 回だけ作る
import { useState, type MutableRefObject } from "react";
import type { ScreenPorts } from "@/features/chat/ui";
import type { ComposerHandle } from "@/features/composer/ui";
import { useTimelineScrollHandle, type TimelineScroll } from "@/features/conversation/ui/timeline/timelineScroll";
import { createScreenActions, type ScreenActions, type SidePanelHandle } from "./screenActions";

export interface ChatShellHandles extends ScreenActions {
  /** 登録簿に載せる口（描き直しても同じ物） */
  ports: ScreenPorts;
  scroll: TimelineScroll;
  composerSlot: MutableRefObject<ComposerHandle | null>;
  side: MutableRefObject<SidePanelHandle | null>;
}

/**
 * 口は会話の欄を隠しても止まらない殻で 1 回だけ作る。口が読む描いた値（窓・送り方）は会話の欄が描くたびに入れる
 * （隠れている間は、隠す前の値のまま。隠れた会話の欄の state を変える操作は、表に戻したときに描かれる）
 */
export function useChatShell({
  chatId,
  focus,
  canOpenSide,
  beforeReveal,
}: {
  chatId: number;
  focus?: number;
  canOpenSide: boolean;
  /** 会話へ移る前にすること（呼ぶときに読む） */
  beforeReveal: () => void;
}): ChatShellHandles {
  // 検索結果から開いたときは、初めから一番下へ付いていかない（移り先へ跳ぶ前に一番下へ寄せない）
  const scroll = useTimelineScrollHandle(!focus);
  // 画面の要素・チャット欄・右の欄の口の入れ物も、口と一緒に 1 回だけ作る（timelineScroll.ts の ref と同じ形）
  const [handles] = useState<ChatShellHandles>(() => {
    const root: MutableRefObject<HTMLDivElement | null> = { current: null };
    const composerSlot: MutableRefObject<ComposerHandle | null> = { current: null };
    const side: MutableRefObject<SidePanelHandle | null> = { current: null };
    const actions = createScreenActions({ chatId, canOpenSide, scroll, composer: () => composerSlot.current, side: () => side.current, beforeReveal: () => beforeReveal() });
    const ports: ScreenPorts = { root, timeline: actions.timeline, subagents: actions.subagents, activity: actions.activity, composer: actions.composer };
    return { ...actions, ports, scroll, composerSlot, side };
  });
  return handles;
}
