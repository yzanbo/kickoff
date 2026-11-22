// チャットの画面の口（流れ・サブエージェント・動き・書き直し・入力欄）を 1 回だけ作り、またがる操作（カードへ移る・会話へ戻る）を組む
import { openAll, timelineView, type ActivityNav, type ComposerPort, type SubagentNav, type TimelineNav } from "@/features/chat/ui";
import { chatSubagents, pathOf } from "@/features/subagents/ui";
import type { ComposerHandle } from "@/features/composer/ui";
import { createTimelineNav, type TimelineNavWindow } from "@/features/conversation/ui/timeline/createTimelineNav";
import type { TimelineScroll } from "@/features/conversation/ui/timeline/timelineScroll";
import { createActivityNav } from "@/features/conversation/ui/activity/createActivityNav";
import { createRewindActions, type RewindSend } from "@/features/conversation/ui/rewind/createRewindActions";
import type { RewindActions } from "@/features/conversation/ui/rewindContext";
import { createSubagentNav } from "./createSubagentNav";

/** 右の欄（サブエージェントの欄）の殻を外から動かす口（AgentPanel が入れる） */
export interface SidePanelHandle {
  /** メインの会話を覆っていれば、並べる形に戻す（流れの中のカードへ移るとき） */
  uncover: () => void;
}

export interface ScreenDeps {
  chatId: number;
  /** 右の欄を置けるか（パネルの中のチャット） */
  canOpenSide: boolean;
  scroll: TimelineScroll;
  /** チャット欄の口（呼ぶときに読む） */
  composer: () => ComposerHandle | null;
  /** 右の欄の殻の口（呼ぶときに読む） */
  side: () => SidePanelHandle | null;
  /** 会話へ移る前にすること（ピルの列を画面の外に描いているとき、画面を見せる） */
  beforeReveal: () => void;
}

export interface ScreenActions {
  timeline: TimelineNav;
  subagents: SubagentNav;
  activity: ActivityNav;
  rewind: RewindActions;
  composer: ComposerPort;
  /** 会話の欄が描くたびに入れる（窓・指示の移り方・読んだあとの続き） */
  setWindow: (window: TimelineNavWindow) => void;
  /** 会話の欄が描くたびに入れる（選択・送り方） */
  setSend: (send: RewindSend) => void;
}

/**
 * 口はどれも、描き直しても同じ物（中身はいつも最新の値で動く）なので、memo した流れの項目に配っても描き直させない。
 * いまのプロジェクト・サブエージェントの一覧・末尾の位置は店から読み、描いた値（窓・送り方）だけを set… で入れ直す
 */
export function createScreenActions({ chatId, canOpenSide, scroll, composer, side, beforeReveal }: ScreenDeps): ScreenActions {
  const t = createTimelineNav({ chatId, scroll, beforeReveal });
  const toConversation = () => activity.showing.set("conversation");
  const subagents = createSubagentNav({
    chatId,
    canOpenSide,
    release: () => scroll.release(),
    reveal: (key, inside) => {
      beforeReveal();
      const path = pathOf(chatSubagents.read(chatId).tree, key);
      const target = path.at(-1);
      if (!target) return;
      // 右の欄がメインの会話を覆っていれば、並べる形に戻してから移る
      side()?.uncover();
      // 外側のカードから自分まで開き、いちばん外側のカードを窓に入れてから移る（動きを見せていれば会話に戻す）
      openAll(timelineView(chatId), path.map((s) => `sa:${s.key}`));
      toConversation();
      scroll.release();
      const root = path[0].toolUseEventId;
      // いちばん外側のカードの前後を描き、開いた状態が描かれてから移る（先に移ると、描き直しで強調の印が消える）
      const eventId = inside ?? target.toolUseEventId;
      const go = () => eventId !== undefined && t.jumpWhenDrawn(eventId);
      if (root !== undefined) void t.drawn(root).then(go);
      else go();
    },
  });
  const activity = createActivityNav({
    beforeShow: () => {
      beforeReveal();
      // 右の欄がメインの会話を覆っていれば、並べる形に戻す（右の欄から、メインの動きを開くとき）
      side()?.uncover();
    },
    revealInConversation: (eventId, agent) => {
      if (agent !== null) return subagents.open(agent, eventId);
      beforeReveal();
      toConversation();
      if (eventId === undefined) return;
      scroll.release();
      // 会話を描き直し、その前後を描いてから移る（隠している間の流れの中では、移っても見えない）
      void t.drawn(eventId).then(() => t.jumpWhenDrawn(eventId));
    },
  });
  const rewind = createRewindActions(chatId, () => scroll.follow());
  return {
    timeline: t.nav,
    subagents,
    activity,
    rewind: rewind.actions,
    composer: {
      fill: (text, opts) => composer()?.fill(text, opts),
      focus: () => composer()?.focus(),
    },
    setWindow: t.setWindow,
    setSend: rewind.setSend,
  };
}
