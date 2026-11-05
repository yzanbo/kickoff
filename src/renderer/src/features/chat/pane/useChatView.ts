import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Approval, Chat, ChatEvent, ChatLive, Project } from "@shared/types";
import { api } from "@/api";
import { createValueCell } from "@/lib/valueCell";
import { readSetting } from "@/lib/storage";
import { SUBAGENT_OPEN_IN } from "@/lib/storageKeys";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelKey } from "@/features/panel/surfaces";
import { useFileLinks } from "@/features/fileLinks/useFileLinks";
import type { NewChatTarget } from "@/features/panel/tabs/panelTypes";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { promptListOf } from "@/features/chat/prompts/promptHistory";
import { usePromptKeys } from "@/features/chat/prompts/usePromptKeys";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import { confirmRewindSend, restoreFilesBefore } from "@/features/chat/rewind/rewindActions";
import { retryTurn, useRetryChoices } from "@/features/chat/rewind/useRetryChoices";
import { useSubagents } from "@/features/chat/subagents/useSubagents";
import type { SubagentsView } from "@/features/chat/subagents/subagentsContext";
import { pathOf, subagentTree } from "@/features/chat/subagents/subagentTree";
import { agentHues } from "@/features/chat/subagents/agentHues";
import { jumpToEvent } from "@/features/chat/timeline/jumpToEvent";
import { groupEvents, relativize } from "@/features/chat/timeline/timelineItems";
import { useTimelineScrollHandle } from "@/features/chat/timeline/timelineScroll";
import { useTimelineWindow } from "@/features/chat/timeline/useTimelineWindow";
import type { ChatPaneActions, ChatPaneState } from "./chatPaneContext";
import { useChatSend } from "./useChatSend";

export interface ChatViewInput {
  chat: Chat;
  project?: Project;
  events: ChatEvent[];
  approvals: Approval[];
  /** 作業中の様子（コアが持つ形のまま。停止中はほかの画面から止めたときも） */
  live: ChatLive;
  /** 書いている途中の返答 */
  streaming: string;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** 新しいチャットのタブを開く（送信待ちの指示を新しいチャットで聞くとき。パネルの外では渡さない） */
  onOpenNew?: (target: NewChatTarget, seed?: NewChatSeed) => void;
}

/** 右の欄（サブエージェントの欄）の殻を外から動かす口（AgentPanel が入れる） */
export interface SidePanelHandle {
  /** メインの会話を覆っていれば、並べる形に戻す（流れの中のカードへ移るとき） */
  uncover: () => void;
}

/** 右の欄の中のサブエージェントの画面（data-agent-screen）の、スクロールする欄 */
const sideScroller = (chatId: number, key: string) =>
  document.querySelector<HTMLElement>(`[data-agent-screen="${chatId}:${key}"] .subagent-screen-scroll`);

/**
 * 1 つのチャットの画面（ChatView）の状態と操作: 選択（モデル・深さ・権限）・作業中の様子・サブエージェント・流れ（窓とスクロール）・
 * 自分の指示の一覧・送り方と、子の部品に配る操作（ChatPaneActions。チャットごとに 1 回だけ作る）。
 * ChatView は描くだけ（ChatView はチャットごとに作り直す = key がチャットの ID）
 */
export function useChatView(
  { chat, project, events, approvals, live: coreLive, streaming, focus, onOpenNew }: ChatViewInput,
  /** 右の欄（サブエージェントの欄）を置けるか（パネルの中のチャット） */
  canOpenSide = false,
) {
  const options = useChatOptions(
    { model: chat.model, effort: chat.effort, permission_mode: chat.permission_mode, fast_mode: chat.fast_mode },
    chat.project_id,
    chat.worktree_path ?? undefined,
  );
  const busy = chat.status === "running";
  // 停止を押して、止まるのを待っている（押してからコアの知らせが届くまでの間も含める。止まったら戻す）
  const [stopClicked, setStopClicked] = useState(false);
  useEffect(() => {
    if (!busy) setStopClicked(false);
  }, [busy]);
  // 画面に出す作業中の様子: 停止中は押した直後から、会話の圧縮中は作業中だけ（作業中の行・チャット欄のメーターで知らせる）
  const live = useMemo<ChatLive>(
    () => ({ ...coreLive, stopping: busy && (stopClicked || coreLive.stopping), compacting: busy ? coreLive.compacting : null }),
    [coreLive, busy, stopClicked],
  );
  const subagents = useSubagents(chat.id, events, busy, live.background);
  // サブエージェントの入れ子（流れの中のカード・ピルの一覧・カードへ移るとき）と、カードが読むもの（変わったときだけ新しい値にし、カードだけが描き直る）
  const tree = useMemo(() => subagentTree(subagents), [subagents]);
  const hues = useMemo(() => agentHues(subagents), [subagents]);
  // 流れの各項目の memo が効くよう、作業場所が変わらない間は同じ関数にする
  const repoPath = project?.repo_path;
  const rel = useCallback((s: string) => (repoPath ? relativize(s, repoPath) : s), [repoPath]);
  const worktree = chat.worktree_path;
  const subagentsView = useMemo<SubagentsView>(
    () => ({ chatId: chat.id, projectId: chat.project_id, worktree, rel, busy, events, tree, hues }),
    [chat.id, chat.project_id, worktree, rel, busy, events, tree, hues],
  );
  // 裏で動いているサブエージェント（作業を止めると一緒に止まる。古い Claude Code では一覧の知らせがないので、一覧の行から数える）
  const runningAgents = subagents.filter((s) => s.status === "running").length;
  const items = useMemo(() => groupEvents(events), [events]);
  // 自分の指示の一覧（指示の履歴・⌘⌥↑ / ↓・上に貼り付ける指示の帯・チャット欄の ↑ の呼び出し。記録が変わったときだけ作り直す）
  const prompts = promptListOf(events);
  // 返答の中のファイルのパスを、押してエディタタブで開けるチップにする（作業場所のファイルだけ）
  const fileLinks = useFileLinks(chat, project?.repo_path);

  // 画面の要素・チャット欄・流れのスクロール（一番下に付いていくか）
  const rootRef = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerHandle | null>(null);
  const side: MutableRefObject<SidePanelHandle | null> = useRef(null);
  const scroll = useTimelineScrollHandle();
  // 流れは最近の項目だけを描く（長いチャットでも軽くする。検索・移り先は、その前後だけを描く）
  const timeline = useTimelineWindow({ items, chatId: chat.id, focus, scroll });
  // 移り先が窓の外なら、窓を広げて描いてから移る
  const [jumpTarget, setJumpTarget] = useState<number | null>(null);
  useEffect(() => {
    const el = scroll.ref.current;
    if (jumpTarget !== null && el && jumpToEvent(el, jumpTarget)) setJumpTarget(null);
  }, [jumpTarget, timeline.visible, scroll]);
  // 失敗した作業の直し方（変わる様子として配り、失敗した作業の終わりの行だけが描き直る）
  const retry = useRetryChoices(events, busy, options);
  const send = useChatSend({ chatId: chat.id, busy, queued: live.queue.messages.length > 0, options, scroll, background: live.background, runningAgents, onStopping: setStopClicked });

  // ⌘⌥↑ / ↓ で前後の指示へ（上に貼り付けた指示の帯の ↑ / ↓ も）
  const promptKeys = usePromptKeys({ root: rootRef, timeline: scroll.ref, promptIds: prompts.ids, onJump: (id) => pane.jumpTo(id) });
  // 操作がいつも最新の値で動くよう、描くたびに入れ直す（操作そのものは作り直さない）
  const fresh = { chat, options, tree, timeline, onOpenNew, stepPrompt: promptKeys.go };
  const latest = useRef(fresh);
  latest.current = fresh;

  const [pane] = useState<ChatPaneActions>(() => {
    const now = () => latest.current;
    const chatId = chat.id;
    const state = createValueCell<ChatPaneState>({
      retry,
      openSubagents: new Set(),
      fullSubagents: new Set(),
      showing: "conversation",
      activityFilter: { kind: "all" },
      relayTarget: null,
    });
    const patch = (next: Partial<ChatPaneState>) => state.set({ ...state.get(), ...next });
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
      root: rootRef,
      revealSubagent: (key, inside) => {
        const path = pathOf(now().tree, key);
        const target = path.at(-1);
        if (!target) return;
        // 右の欄がメインの会話を覆っていれば、並べる形に戻してから移る
        side.current?.uncover();
        // 外側のカードから自分まで開き、いちばん外側のカードを窓に入れてから移る（動きを見せていれば会話に戻す）
        patch({ openSubagents: new Set([...state.get().openSubagents, ...path.map((s) => s.key)]), showing: "conversation" });
        scroll.release();
        const root = path[0].toolUseEventId;
        if (root !== undefined) now().timeline.reveal(root);
        // 開いた状態が描かれてから移る（先に移ると、描き直しで強調の印が消える）
        const eventId = inside ?? target.toolUseEventId;
        if (eventId !== undefined) requestAnimationFrame(() => jumpWhenDrawn(eventId));
      },
      openSubagent: (key, eventId) => {
        if (canOpenSide && readSetting(SUBAGENT_OPEN_IN) === "side") actions.openSubagentSide(key, eventId);
        else actions.revealSubagent(key, eventId);
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
        // 右の欄がメインの会話を覆っていれば、並べる形に戻す（右の欄の「動きで見る」から、メインの動きを開くとき）
        side.current?.uncover();
        patch({ showing, ...(filter ? { activityFilter: filter } : {}) });
      },
      revealInConversation: (eventId, agent) => {
        if (agent !== null) return actions.openSubagent(agent, eventId);
        patch({ showing: "conversation" });
        if (eventId === undefined) return;
        scroll.release();
        // 会話を描き直してから移る（隠している間の流れの中では、移っても見えない）
        if (now().timeline.reveal(eventId)) requestAnimationFrame(() => jumpWhenDrawn(eventId));
        else setJumpTarget(eventId);
      },
      toggleSubagentFull: (key) => {
        const next = new Set(state.get().fullSubagents);
        if (!next.delete(key)) next.add(key);
        patch({ fullSubagents: next });
      },
      tellSubagent: (key) => {
        const entry = now().tree.byKey.get(key);
        if (!entry?.agentId) return;
        patch({ relayTarget: { key, agentId: entry.agentId, description: entry.description } });
        composer.current?.focus();
      },
      clearRelay: () => patch({ relayTarget: null }),
      rewind: async (eventId, text) => {
        const choice = await confirmRewindSend(chatId, eventId);
        if (!choice) return false;
        scroll.follow();
        await api.rewindChat(chatId, eventId, text, now().options.options, choice.restoreFiles);
        return true;
      },
      restoreFiles: (eventId) => restoreFilesBefore(chatId, eventId),
      retry: (change) => retryTurn(chatId, now().options, change),
      jumpTo: (eventId) => {
        scroll.release();
        const el = scroll.ref.current;
        // 移ったら流れにピントを置く（続けて ⌘⌥↑ / ↓・↑↓ のスクロールが効くように。一覧を閉じてピントが外れたままにしない）
        el?.focus({ preventScroll: true });
        if (!now().timeline.reveal(eventId)) setJumpTarget(eventId);
        else if (el) jumpToEvent(el, eventId);
      },
      reveal: (eventId) => {
        scroll.release();
        now().timeline.reveal(eventId);
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
