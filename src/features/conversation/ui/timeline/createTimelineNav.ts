// 流れの中を移る口（TimelineNav）の実装。チャットの画面がチャットごとに 1 回だけ作り、会話の欄が描くたびに窓を入れ直す
import { createCell } from "@/foundation/ui/store";
import { chatLog, chatWindow, type TimelineNav, chatsApi } from "@/features/chat/ui";
import { jumpToEvent } from "./jumpToEvent";
import type { TimelineScroll } from "./timelineScroll";

/** 遠い記録を読んでいるとき、押した所に回る印を出すまでの時間 */
const JUMP_PENDING_MS = 150;

/** 会話の欄が描くたびに入れる、移る処理が読むいまの値（隠れている間は、隠す前の値のまま） */
export interface TimelineNavWindow {
  /** 窓でその記録の前後を描いて測り終えたら解決する */
  revealEvent: (eventId: number) => Promise<void>;
  /** 前後の自分の指示へ移る（⌘⌥↑ / ↓ と同じ） */
  stepPrompt: (dir: -1 | 1, from?: number) => void;
  /** 遠い記録を読んだあと、流れに出たら then */
  showAfter: (eventId: number, then: () => void) => void;
}

export interface TimelineNavDeps {
  chatId: number;
  scroll: TimelineScroll;
  /** 会話へ移る前にすること（ピルの列を画面の外に描いているとき、画面を見せる） */
  beforeReveal: () => void;
}

/** 口と、ほかの口が組むときに使う中の手順 */
export interface TimelineNavParts {
  nav: TimelineNav;
  /** 描いた値を入れ直す（会話の欄が描くたびに。描き直しても口は同じ物） */
  setWindow: (window: TimelineNavWindow) => void;
  /** その記録を読んで流れに出し、窓でその前後を描いて測り終えたら解決する */
  drawn: (eventId: number) => Promise<void>;
  /** 描いたあとに、その記録の要素へ移る（開いたカードの中の行は、カードの中身が描かれるまで数フレーム待つ） */
  jumpWhenDrawn: (eventId: number) => void;
}

export function createTimelineNav({ chatId, scroll, beforeReveal }: TimelineNavDeps): TimelineNavParts {
  let current: TimelineNavWindow | null = null;
  const now = () => current!;
  const jumping = createCell<number | null>(null);
  /**
   * その記録を流れに出してから then（読んでいなければ読み、読めて流れに出たら。いまの位置で待ち、JUMP_PENDING_MS を超えたら
   * 押した所に回る印 jumping を出す）
   */
  const whenShown = (eventId: number, then: () => void) => {
    if (chatLog.shows(chatId, eventId)) return then();
    const slow = setTimeout(() => jumping.set(eventId), JUMP_PENDING_MS);
    void chatLog.openAround(chatId, eventId).finally(() => {
      clearTimeout(slow);
      jumping.set(null);
      // 読めなかったら続きを捨てる（残すと、あとで別の読み足しでその記録が出たときに急に移る）
      if (chatLog.shows(chatId, eventId)) now().showAfter(eventId, then);
    });
  };
  // 移る処理はどれもこれを待ってから jumpToEvent
  const drawn = (eventId: number) => new Promise<void>((resolve) => whenShown(eventId, () => void now().revealEvent(eventId).then(resolve)));
  const jumpWhenDrawn = (eventId: number, frames = 10) => {
    const el = scroll.ref.current;
    if (el && jumpToEvent(el, eventId)) return;
    if (frames > 0) requestAnimationFrame(() => jumpWhenDrawn(eventId, frames - 1));
  };
  const nav: TimelineNav = {
    jumpTo: (eventId) => {
      beforeReveal();
      scroll.release();
      const el = scroll.ref.current;
      // 移ったら流れにピントを置く（続けて ⌘⌥↑ / ↓・↑↓ のスクロールが効くように。一覧を閉じてピントが外れたままにしない）
      el?.focus({ preventScroll: true });
      void drawn(eventId).then(() => {
        if (el) jumpToEvent(el, eventId, { smooth: true });
      });
    },
    reveal: (eventId) => {
      scroll.release();
      return drawn(eventId);
    },
    stepPrompt: (dir, from) => now().stepPrompt(dir, from),
    searchTexts: async () => {
      const { tailStart } = chatWindow.read(chatId);
      return tailStart > 0 ? (await chatsApi.chatTexts(chatId, tailStart)).events : [];
    },
    drawn: createCell(0),
    jumping,
  };
  return {
    nav,
    setWindow: (window) => {
      current = window;
    },
    drawn,
    jumpWhenDrawn: (eventId) => jumpWhenDrawn(eventId),
  };
}
