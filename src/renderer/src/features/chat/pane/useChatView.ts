import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Approval, Chat, ChatLive, Project } from "@shared/types";
import { chatLog } from "@/features/chat/store/useChatStore";
import type { ChatLogView } from "@/features/chat/store/chatStore";
import { api } from "@/api";
import { createValueCell } from "@/lib/valueCell";
import { readSetting } from "@/lib/storage";
import { reportFailure } from "@/ui/dialogs";
import { canPopout, openPopout } from "@/app/popout";
import { SUBAGENT_OPEN_IN } from "@/lib/storageKeys";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelKey } from "@/features/panel/surfaces";
import { useFileLinks } from "@/features/fileLinks/useFileLinks";
import type { NewChatTarget } from "@/features/panel/tabs/panelTypes";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { SendCancelled } from "@/features/chat/composer/useComposerSend";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { promptListOf } from "@/features/chat/prompts/promptHistory";
import { usePromptKeys } from "@/features/chat/prompts/usePromptKeys";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import { confirmRewindSend, restoreFilesBefore } from "@/features/chat/rewind/rewindActions";
import { retryTurn, useRetryChoices } from "@/features/chat/rewind/useRetryChoices";
import { useSubagents } from "@/features/chat/subagents/useSubagents";
import type { SubagentsView } from "@/features/chat/subagents/subagentsContext";
import { waitingSubagentKeys } from "@shared/chat/subagentState";
import { pathOf, subagentTree } from "@/features/chat/subagents/subagentTree";
import { agentHues } from "@/features/chat/subagents/agentHues";
import { jumpToEvent } from "@/features/chat/timeline/jumpToEvent";
import { useChipsPortal } from "./chipsPortal";
import { groupEvents, relativize } from "@/features/chat/timeline/timelineItems";
import { useTimelineScrollHandle } from "@/features/chat/timeline/timelineScroll";
import { useTimelineWindow } from "@/features/chat/timeline/useTimelineWindow";
import type { ChatPaneActions, ChatPaneState } from "./chatPaneContext";
import { compactHoldOf } from "./compactHold";
import { useChatSend } from "./useChatSend";

export interface ChatViewInput {
  chat: Chat;
  project?: Project;
  /** 記録の口（流れに出す記録・末尾・記録全体から作るものに渡す digest。useChatContent） */
  log: ChatLogView;
  approvals: Approval[];
  /** 作業中の様子（コアが持つ形のまま。停止中はほかの画面から止めたときも） */
  live: ChatLive;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** 新しいチャットのタブを開く（送信待ちの指示・選んだ文を新しいチャットで聞くとき。パネルの外では渡さない） */
  onOpenNew?: (target: NewChatTarget, seed?: NewChatSeed) => void;
  /** 送る前にすること（メモのチャットで、書きかけのメモを保存してから送る） */
  beforeSend?: () => Promise<void>;
}

/** 右の欄（サブエージェントの欄）の殻を外から動かす口（AgentPanel が入れる） */
export interface SidePanelHandle {
  /** メインの会話を覆っていれば、並べる形に戻す（流れの中のカードへ移るとき） */
  uncover: () => void;
}

/** 遠い記録を読んでいるとき、押した所に回る印を出すまでの時間（メモの仕様書「0023_表示を軽くする」の Q1 A） */
const JUMP_PENDING_MS = 150;

/** 右の欄の中のサブエージェントの画面（data-agent-screen）の、スクロールする欄 */
const sideScroller = (chatId: number, key: string) =>
  document.querySelector<HTMLElement>(`[data-agent-screen="${chatId}:${key}"] .subagent-screen-scroll`);

/**
 * 1 つのチャットの画面（ChatView）の状態と操作: 選択（モデル・深さ・権限）・作業中の様子・サブエージェント・流れ（窓とスクロール）・
 * 自分の指示の一覧・送り方と、子の部品に配る操作（ChatPaneActions。チャットごとに 1 回だけ作る）。
 * ChatView は描くだけ（ChatView はチャットごとに作り直す = key がチャットの ID）
 */
export function useChatView(
  { chat, project, log, approvals, live: coreLive, focus, onOpenNew, beforeSend }: ChatViewInput,
  /** 右の欄（サブエージェントの欄）を置けるか（パネルの中のチャット） */
  canOpenSide = false,
) {
  const options = useChatOptions(
    { model: chat.model, effort: chat.effort, permission_mode: chat.permission_mode, fast_mode: chat.fast_mode },
    chat.project_id,
    chat.worktree_path ?? undefined,
    chat.provider,
  );
  const busy = chat.status === "running";
  // 停止を押して、止まるのを待っている（押してからコアの知らせが届くまでの間も含める。止まったら戻す）
  const [stopClicked, setStopClicked] = useState(false);
  useEffect(() => {
    if (!busy) setStopClicked(false);
  }, [busy]);
  // 画面に出す作業中の様子: 停止中は押した直後から、会話の圧縮中・圧縮前指示から圧縮が終わるまでは作業中だけ（作業中の行・チャット欄のメーターで知らせる）
  const live = useMemo<ChatLive>(
    () => ({
      ...coreLive,
      stopping: busy && (stopClicked || coreLive.stopping),
      compacting: busy ? coreLive.compacting : null,
      awaiting_compact: busy && coreLive.awaiting_compact,
      compact_after_turn: busy && coreLive.compact_after_turn,
      compacted_turn: busy && coreLive.compacted_turn,
      tells_closed: busy && coreLive.tells_closed,
      inheriting: busy && coreLive.inheriting,
    }),
    [coreLive, busy, stopClicked],
  );
  // 記録全体から作るもの（サブエージェント・指示の一覧・失敗した作業など）は、末尾と索引を重ねた digest から作る（案 4）
  const events = log.digest;
  const subagents = useSubagents(chat.id, events, busy, live.background);
  // サブエージェントの入れ子（流れの中のカード・ピルの一覧・カードへ移るとき）と、カードが読むもの（変わったときだけ新しい値にし、カードだけが描き直る）
  const tree = useMemo(() => subagentTree(subagents), [subagents]);
  const hues = useMemo(() => agentHues(subagents), [subagents]);
  // 流れの各項目の memo が効くよう、作業場所が変わらない間は同じ関数にする
  const repoPath = project?.repo_path;
  const rel = useCallback((s: string) => (repoPath ? relativize(s, repoPath) : s), [repoPath]);
  const worktree = chat.worktree_path;
  // 回答待ちの依頼を出しているサブエージェント（依頼の呼び出しの記録から引く。カード・ピル・タブの「回答待ち」）
  const waiting = useMemo(() => waitingSubagentKeys(approvals, events, subagents), [approvals, events, subagents]);
  const { loaded, tailStart, hasEarlier } = log;
  const subagentsView = useMemo<SubagentsView>(
    () => ({ chatId: chat.id, projectId: chat.project_id, worktree, rel, busy, events, loaded, tailStart, hasEarlier, tree, hues, waiting }),
    [chat.id, chat.project_id, worktree, rel, busy, events, loaded, tailStart, hasEarlier, tree, hues, waiting],
  );
  // 裏で動いているサブエージェント（作業を止めると一緒に止まる。古い Claude Code では一覧の知らせがないので、一覧の行から数える）
  const runningAgents = subagents.filter((s) => s.status === "running").length;
  // 流れに出すのは末尾（遠い発言へ移ったときは途中の一部分）。前に起動したサブエージェントは preface で数える
  const items = useMemo(() => groupEvents(log.events, undefined, { preface: log.preface, partialHead: log.headPartial }), [log.events, log.preface, log.headPartial]);
  // 自分の指示の一覧（指示の履歴・⌘⌥↑ / ↓・上に貼り付ける指示の帯・チャット欄の ↑ の呼び出し。記録が変わったときだけ作り直す）
  const prompts = promptListOf(events);
  // 返答の中のファイルのパス・変更カード・ツールの行のファイルを、押して右の欄（置けなければファイルタブ）で開けるようにする（作業場所のファイルだけ）
  const fileLinks = useFileLinks(chat, project?.repo_path, canOpenSide);

  // 画面の要素・チャット欄・流れのスクロール（一番下に付いていくか）
  const rootRef = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle | null>(null);
  const side: MutableRefObject<SidePanelHandle | null> = useRef(null);
  // 検索結果から開いたときは、初めから一番下へ付いていかない（移り先へ跳ぶ前に一番下へ寄せない）
  const scroll = useTimelineScrollHandle(!focus);
  // 流れは最近の項目だけを描く（長いチャットでも軽くする。検索・移り先は、その前後だけを描く）
  const chatId = chat.id;
  const paging = useMemo(
    () => ({
      loadEarlier: () => chatLog.loadEarlier(chatId),
      loadLater: () => chatLog.loadLater(chatId),
      backToTail: () => chatLog.backToTail(chatId),
    }),
    [chatId],
  );
  const timeline = useTimelineWindow({ items, chatId, focus, scroll, log: { hasEarlier: log.hasEarlier, focused: log.focused, ...paging } });
  // 検索結果から開いた発言を読んでいなければ、その前後を読む（読めたら窓がその前後を描く）
  useEffect(() => {
    if (focus !== undefined && !chatLog.shows(chatId, focus)) void chatLog.openAround(chatId, focus);
  }, [chatId, focus]);
  // 遠い記録を読んだあと、流れに出たら続きをする（openAround のあとに移る・描く）
  const [afterShow, setAfterShow] = useState<{ eventId: number; then: () => void } | null>(null);
  useEffect(() => {
    if (!afterShow) return;
    const first = log.events[0]?.id;
    const shown = first !== undefined && (log.focused ? afterShow.eventId >= first && afterShow.eventId <= log.events.at(-1)!.id : afterShow.eventId >= log.tailStart);
    if (!shown) return;
    setAfterShow(null);
    afterShow.then();
  }, [afterShow, log]);
  // 移り先が窓の外なら、窓を広げて描いてから移る
  const [jumpTarget, setJumpTarget] = useState<number | null>(null);
  useEffect(() => {
    const el = scroll.ref.current;
    if (jumpTarget !== null && el && jumpToEvent(el, jumpTarget, { smooth: true })) setJumpTarget(null);
  }, [jumpTarget, timeline.visible, scroll]);
  // 失敗した作業の直し方（変わる様子として配り、失敗した作業の終わりの行だけが描き直る）
  const retry = useRetryChoices(events, busy, options);
  const send = useChatSend({ chatId: chat.id, busy, queued: live.queue.messages.length > 0, compactHold: compactHoldOf(live), options, scroll, background: live.background, runningAgents, onStopping: setStopClicked, beforeSend });

  // ⌘⌥↑ / ↓ で前後の指示へ（上に貼り付けた指示の帯の ↑ / ↓ も）
  const promptKeys = usePromptKeys({ root: rootRef, timeline: scroll.ref, promptIds: prompts.ids, onJump: (id) => pane.jumpTo(id) });
  // 操作がいつも最新の値で動くよう、描くたびに入れ直す（操作そのものは作り直さない）
  // ピルの列を画面の外に描いているとき（メモのチャットの欄を閉じている）は、会話へ移る前に画面を見せる
  const chipsPortal = useChipsPortal();
  const fresh = { chat, log, options, tree, timeline, onOpenNew, stepPrompt: promptKeys.go, send, reveal: chipsPortal?.reveal };
  const latest = useRef(fresh);
  latest.current = fresh;

  const [pane] = useState<ChatPaneActions>(() => {
    const now = () => latest.current;
    const state = createValueCell<ChatPaneState>({
      retry,
      openSubagents: new Set(),
      fullSubagents: new Set(),
      showing: "conversation",
      activityFilter: { kind: "all" },
      activityFocus: null,
      tellOpen: new Set(),
      jumping: null,
    });
    const patch = (next: Partial<ChatPaneState>) => state.set({ ...state.get(), ...next });
    /**
     * その記録を流れに出してから then（読んでいなければ読み、読めて流れに出たら。Q1 A: いまの位置で待ち、JUMP_PENDING_MS を超えたら
     * 押した所に回る印 jumping を出す）
     */
    const whenShown = (eventId: number, then: () => void) => {
      if (chatLog.shows(chatId, eventId)) return then();
      const slow = setTimeout(() => patch({ jumping: eventId }), JUMP_PENDING_MS);
      void chatLog.openAround(chatId, eventId).finally(() => {
        clearTimeout(slow);
        if (state.get().jumping !== null) patch({ jumping: null });
        setAfterShow({ eventId, then });
      });
    };
    /** 描いたあとに、その記録の要素へ移る（開いたカードの中身が描かれるまで、数フレーム待つ） */
    const jumpWhenDrawn = (eventId: number, frames = 20) => {
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
        patch({ openSubagents: new Set([...state.get().openSubagents, ...path.map((s) => s.key)]), showing: "conversation" });
        scroll.release();
        const root = path[0].toolUseEventId;
        const go = () => {
          if (root !== undefined) now().timeline.reveal(root);
          // 開いた状態が描かれてから移る（先に移ると、描き直しで強調の印が消える）
          const eventId = inside ?? target.toolUseEventId;
          if (eventId !== undefined) requestAnimationFrame(() => jumpWhenDrawn(eventId));
        };
        if (root !== undefined) whenShown(root, go);
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
        const current = state.get().openSubagents;
        const next = new Set(current);
        if (open ?? !current.has(key)) next.add(key);
        else next.delete(key);
        patch({ openSubagents: next });
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
        // 会話を描き直してから移る（隠している間の流れの中では、移っても見えない）
        whenShown(eventId, () => {
          if (now().timeline.reveal(eventId)) requestAnimationFrame(() => jumpWhenDrawn(eventId));
          else setJumpTarget(eventId);
        });
      },
      toggleSubagentFull: (key) => {
        const next = new Set(state.get().fullSubagents);
        if (!next.delete(key)) next.add(key);
        patch({ fullSubagents: next });
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
        whenShown(eventId, () => {
          if (!now().timeline.reveal(eventId)) setJumpTarget(eventId);
          else if (el) jumpToEvent(el, eventId, { smooth: true });
        });
      },
      reveal: (eventId) => {
        scroll.release();
        whenShown(eventId, () => now().timeline.reveal(eventId));
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
    };
    return actions;
  });
  // 変わる様子を配る（変わったときだけ。読んでいる部品だけが描き直る）
  useLayoutEffect(() => {
    if (pane.state.get().retry !== retry) pane.state.set({ ...pane.state.get(), retry });
  }, [pane, retry]);

  return { pane, options, busy, live, subagents, subagentsView, items, prompts, rel, fileLinks, composer, side, scroll, timeline, send };
}
