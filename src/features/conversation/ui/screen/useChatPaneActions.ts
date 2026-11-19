import { useRef, useState, type MutableRefObject } from "react";
import type { Chat } from "@shared/types";
import { chatLog } from "@/features/chat/ui/store/useChatStore";
import type { ChatLogView } from "@/features/chat/ui/store/chatStore";
import { api } from "@/foundation/ui/api";
import { createValueCell } from "@/foundation/ui/store/valueCell";
import { readSetting } from "@/foundation/ui/storage/settings";
import { reportFailure } from "@/foundation/ui/kit/dialogs";
import { canPopout, openPopout } from "@/foundation/ui/navigation/popout";
import { SUBAGENT_OPEN_IN } from "@/foundation/ui/storage/storageKeys";
import { panelActions } from "@/features/panel/ui/state/panelActions";
import { panelKey } from "@/features/panel/ui/surfaces";
import type { NewChatTarget } from "@/features/panel/ui/tabs/panelTypes";
import type { ComposerHandle } from "@/features/composer/ui/composerHandle";
import { SendCancelled } from "@/features/composer/ui/useComposerSend";
import type { ChatOptionsState } from "@/features/ai/ui/options/ChatOptionsBar";
import type { NewChatSeed } from "@/features/queue/ui/askInNewChat";
import { confirmRewindSend, restoreFilesBefore } from "@/features/conversation/ui/rewind/rewindActions";
import { retryTurn } from "@/features/conversation/ui/rewind/useRetryChoices";
import { pathOf, type SubagentTree } from "@/features/subagents/ui/model/subagentTree";
import { jumpToEvent } from "@/features/conversation/ui/timeline/jumpToEvent";
import { openAll, setOpen, timelineView } from "@/features/chat/ui/timeline/timelineView";
import { useTimelineScrollHandle, type TimelineScroll } from "@/features/conversation/ui/timeline/timelineScroll";
import type { TimelineWindow } from "@/features/conversation/ui/timeline/useTimelineWindow";
import type { ChatPaneActions, ChatPaneState } from "@/features/chat/ui/screen/ports";
import type { useChatSend } from "@/features/composer/ui/send/chatSend";

/** 右の欄（サブエージェントの欄）の殻を外から動かす口（AgentPanel が入れる） */
export interface SidePanelHandle {
  /** メインの会話を覆っていれば、並べる形に戻す（流れの中のカードへ移るとき） */
  uncover: () => void;
}

/** 遠い記録を読んでいるとき、押した所に回る印を出すまでの時間 */
const JUMP_PENDING_MS = 150;

/** 右の欄の中のサブエージェントの画面（data-agent-screen）の、スクロールする欄 */
const sideScroller = (chatId: number, key: string) =>
  document.querySelector<HTMLElement>(`[data-agent-screen="${chatId}:${key}"] .subagent-screen-scroll`);

/** 会話の欄（ChatColumn）が描くたびに入れる、操作が読むいまの値（隠れている間は、隠す前の値のまま） */
export interface PaneLatest {
  chat: Chat;
  log: ChatLogView;
  options: ChatOptionsState;
  tree: SubagentTree;
  timeline: TimelineWindow;
  onOpenNew?: (target: NewChatTarget, seed?: NewChatSeed) => void;
  stepPrompt: (dir: -1 | 1, from?: number) => void;
  send: ReturnType<typeof useChatSend>;
  /** ピルの列を画面の外に描いているとき、会話へ移る前に画面を見せる */
  reveal?: () => void;
  /** 遠い記録を読んだあと、流れに出たら then */
  showAfter: (eventId: number, then: () => void) => void;
}

/** チャットの画面の殻（ChatView）が持つもの: 操作・いまの値の入れ物・流れのスクロール・チャット欄・右の欄の口（チャットごとに 1 回だけ作る） */
export interface ChatShellHandles {
  pane: ChatPaneActions;
  latest: MutableRefObject<PaneLatest | null>;
  scroll: TimelineScroll;
  composer: MutableRefObject<ComposerHandle | null>;
  side: MutableRefObject<SidePanelHandle | null>;
}

/**
 * 1 つのチャットの画面の操作（ChatPaneActions）を、会話の欄を隠しても止まらない殻（ChatView）で 1 回だけ作る。
 * 操作が読む値（記録・選択・窓・送り方）は会話の欄が描くたびに latest に入れる（隠れている間は、隠す前の値のまま。
 * 隠れた会話の欄の state を変える操作は、表に戻したときに描かれる）
 */
export function useChatPaneActions({
  chatId,
  focus,
  canOpenSide,
  onOpenNew,
}: {
  chatId: number;
  focus?: number;
  /** 右の欄（サブエージェントの欄）を置けるか（パネルの中のチャット） */
  canOpenSide: boolean;
  onOpenNew?: (target: NewChatTarget, seed?: NewChatSeed) => void;
}): ChatShellHandles {
  const latest = useRef<PaneLatest | null>(null);
  // 画面の要素・チャット欄・流れのスクロール（一番下に付いていくか）
  const rootRef = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle | null>(null);
  const side: MutableRefObject<SidePanelHandle | null> = useRef(null);
  // 検索結果から開いたときは、初めから一番下へ付いていかない（移り先へ跳ぶ前に一番下へ寄せない）
  const scroll = useTimelineScrollHandle(!focus);
  const [pane] = useState<ChatPaneActions>(() => {
    const now = () => latest.current!;
    const state = createValueCell<ChatPaneState>({
      retry: null,
      showing: "conversation",
      activityFilter: { kind: "all" },
      activityFocus: null,
      tellOpen: new Set(),
      jumping: null,
    });
    const patch = (next: Partial<ChatPaneState>) => state.set({ ...state.get(), ...next });
    /**
     * その記録を流れに出してから then（読んでいなければ読み、読めて流れに出たら。いまの位置で待ち、JUMP_PENDING_MS を超えたら
     * 押した所に回る印 jumping を出す）
     */
    const whenShown = (eventId: number, then: () => void) => {
      if (chatLog.shows(chatId, eventId)) return then();
      const slow = setTimeout(() => patch({ jumping: eventId }), JUMP_PENDING_MS);
      void chatLog.openAround(chatId, eventId).finally(() => {
        clearTimeout(slow);
        if (state.get().jumping !== null) patch({ jumping: null });
        now().showAfter(eventId, then);
      });
    };
    /**
     * その記録を読んで流れに出し、窓でその前後を描いて測り終えたら解決する（移る処理はどれもこれを待ってから jumpToEvent）
     */
    const drawn = (eventId: number) => new Promise<void>((resolve) => whenShown(eventId, () => void now().timeline.revealEvent(eventId).then(resolve)));
    /** 描いたあとに、その記録の要素へ移る（開いたカードの中の行は、カードの中身が描かれるまで数フレーム待つ） */
    const jumpWhenDrawn = (eventId: number, frames = 10) => {
      const el = scroll.ref.current;
      if (el && jumpToEvent(el, eventId)) return;
      if (frames > 0) requestAnimationFrame(() => jumpWhenDrawn(eventId, frames - 1));
    };
    /** 右の欄に開いたサブエージェントの画面の中の、その記録の要素へ移る（タブの中身が描かれるまで、数フレーム待つ） */
    const jumpInSide = (key: string, eventId: number, frames = 20) => {
      const el = sideScroller(chatId, key);
      if (el && jumpToEvent(el, eventId)) return;
      if (frames > 0) requestAnimationFrame(() => jumpInSide(key, eventId, frames - 1));
    };
    const actions: ChatPaneActions = {
      chatId,
      projectId: () => now().chat.project_id,
      root: rootRef,
      revealSubagent: (key, inside) => {
        now().reveal?.();
        const path = pathOf(now().tree, key);
        const target = path.at(-1);
        if (!target) return;
        // 右の欄がメインの会話を覆っていれば、並べる形に戻してから移る
        side.current?.uncover();
        // 外側のカードから自分まで開き、いちばん外側のカードを窓に入れてから移る（動きを見せていれば会話に戻す）
        openAll(timelineView(chatId), path.map((s) => `sa:${s.key}`));
        patch({ showing: "conversation" });
        scroll.release();
        const root = path[0].toolUseEventId;
        // いちばん外側のカードの前後を描き、開いた状態が描かれてから移る（先に移ると、描き直しで強調の印が消える）
        const eventId = inside ?? target.toolUseEventId;
        const go = () => eventId !== undefined && jumpWhenDrawn(eventId);
        if (root !== undefined) void drawn(root).then(go);
        else go();
      },
      openSubagent: (key, eventId) => {
        const place = readSetting(SUBAGENT_OPEN_IN);
        if (place === "window" && canPopout()) actions.openSubagentWindow(key);
        else if (place !== "inline" && canOpenSide) actions.openSubagentSide(key, eventId);
        else actions.revealSubagent(key, eventId);
      },
      openSubagentWindow: (key) => {
        if (!canPopout()) return actions.openSubagentSide(key);
        const entry = now().tree.byKey.get(key);
        openPopout({ kind: "subagent", chatId, agentKey: key }, `${entry?.description ?? "サブエージェント"} — サブエージェント`);
      },
      openSubagentSide: (key, eventId) => {
        const entry = now().tree.byKey.get(key);
        if (!entry) return;
        if (!canOpenSide) return actions.revealSubagent(key, eventId);
        // サブエージェントの中で起動したもの（入れ子）は、タブに外側からの道筋を持たせる（名前の前の「↳」と、乗せたときの道筋）
        const path = pathOf(now().tree, key);
        panelActions(panelKey("agents", chatId)).openSubagent({
          chatId,
          agentKey: key,
          title: entry.description,
          ...(path.length > 1 ? { path: path.map((s) => s.description).join(" › ") } : {}),
        });
        if (eventId !== undefined) requestAnimationFrame(() => jumpInSide(key, eventId));
      },
      canOpenSide,
      toggleSubagent: (key, open) => {
        // 開閉は流れの見え方の店（行が窓から外れて戻っても・画面を作り直しても開いたまま）
        const view = timelineView(chatId);
        setOpen(view, `sa:${key}`, open ?? !view.open.get().has(`sa:${key}`));
      },
      show: (showing, filter) => {
        now().reveal?.();
        // 右の欄がメインの会話を覆っていれば、並べる形に戻す（右の欄から、メインの動きを開くとき）
        side.current?.uncover();
        // 絞り込みを選び直したら、強調はやめる
        patch({ showing, ...(filter ? { activityFilter: filter, activityFocus: null } : {}) });
      },
      focusActivity: (key) => {
        now().reveal?.();
        side.current?.uncover();
        const nonce = (state.get().activityFocus?.nonce ?? 0) + 1;
        patch({ showing: "activity", activityFilter: { kind: "all" }, activityFocus: { key, nonce } });
      },
      clearActivityFocus: () => patch({ activityFocus: null }),
      revealInConversation: (eventId, agent) => {
        if (agent !== null) return actions.openSubagent(agent, eventId);
        now().reveal?.();
        patch({ showing: "conversation" });
        if (eventId === undefined) return;
        scroll.release();
        // 会話を描き直し、その前後を描いてから移る（隠している間の流れの中では、移っても見えない）
        void drawn(eventId).then(() => jumpWhenDrawn(eventId));
      },
      toggleSubagentFull: (key) => {
        const view = timelineView(chatId);
        setOpen(view, `sf:${key}`, !view.open.get().has(`sf:${key}`));
      },
      tellSubagent: (key) => {
        if (!now().tree.byKey.get(key)?.agentId) return;
        // 書いている間に、カードの入力欄が流れの上へ流れていかないように
        scroll.release();
        patch({ tellOpen: new Set([...state.get().tellOpen, key]) });
      },
      closeTell: (key) => {
        const next = new Set(state.get().tellOpen);
        if (next.delete(key)) patch({ tellOpen: next });
      },
      rewind: async (eventId, text) => {
        const choice = await confirmRewindSend(chatId, eventId);
        if (!choice) return false;
        scroll.follow();
        await api.rewindChat(chatId, eventId, text, now().options.options, choice.restoreFiles);
        return true;
      },
      resend: async (text, attachments) => {
        const { send } = now();
        try {
          // 入力欄の文ではないので、入力欄の子チャットからの依頼の出どころは付けない
          await send.onSendOther(text, attachments);
        } catch (e) {
          // 送る前の確かめでやめたときは、何も出さない
          if (!(e instanceof SendCancelled)) void reportFailure("もう一度送れませんでした")(e);
        }
      },
      restoreFiles: (eventId) => restoreFilesBefore(chatId, eventId),
      retry: (change) => retryTurn(chatId, now().options, change),
      jumpTo: (eventId) => {
        now().reveal?.();
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
      searchTexts: async () => {
        const { tailStart } = now().log;
        return tailStart > 0 ? (await api.chatTexts(chatId, tailStart)).events : [];
      },
      stepPrompt: (dir, from) => now().stepPrompt(dir, from),
      fillComposer: (text, opts) => composer.current?.fill(text, opts),
      focusComposer: () => composer.current?.focus(),
      // 作成先は、いまのチャットのプロジェクト・グループ（移したあとも、いまのもの）
      askInNewChat: onOpenNew && ((seed) => now().onOpenNew?.({ projectId: now().chat.project_id, group: now().chat.group_id ?? undefined }, seed)),
      state,
      drawn: createValueCell(0),
    };
    return actions;
  });
  const [handles] = useState<ChatShellHandles>(() => ({ pane, latest, scroll, composer, side }));
  return handles;
}
