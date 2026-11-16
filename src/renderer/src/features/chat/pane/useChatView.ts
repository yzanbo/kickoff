import { useEffect, useInsertionEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Chat, ChatLive, Project } from "@shared/types";
import { chatLog, useChatDetailView, useChatLog, useChatSubagents, useChatSubagentsView } from "@/features/chat/store/useChatStore";
import type { NewChatTarget } from "@/features/panel/tabs/panelTypes";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { promptListOf } from "@/features/chat/prompts/promptHistory";
import { usePromptKeys } from "@/features/chat/prompts/usePromptKeys";
import type { NewChatSeed } from "@/features/chat/queue/askInNewChat";
import { useRetryChoices } from "@/features/chat/rewind/useRetryChoices";
import { useChipsPortal } from "./chipsPortal";
import { groupEvents, relativeOf } from "@/features/chat/timeline/timelineItems";
import { useTimelineWindow } from "@/features/chat/timeline/useTimelineWindow";
import { timelineView } from "@/features/chat/timeline/timelineView";
import { compactHoldOf } from "./compactHold";
import { useChatSend } from "./useChatSend";
import type { ChatShellHandles, PaneLatest } from "./useChatPaneActions";

export interface ChatViewInput {
  chat: Chat;
  project?: Project;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** 新しいチャットのタブを開く（送信待ちの指示・選んだ文を新しいチャットで聞くとき。パネルの外では渡さない） */
  onOpenNew?: (target: NewChatTarget, seed?: NewChatSeed) => void;
  /** 送る前にすること（メモのチャットで、書きかけのメモを保存してから送る） */
  beforeSend?: () => Promise<void>;
}

/**
 * 1 つのチャットの会話の欄（ChatColumn）の状態: 選択（モデル・深さ・権限）・作業中の様子・サブエージェント・流れ（窓とスクロール）・
 * 自分の指示の一覧・送り方。記録・回答待ち・作業中の様子はチャットの店の口をここで読む（会話の欄は隠すと止まる Activity の中なので、
 * 隠れている間は記録が届いても描き直さない）。子の部品に配る操作（ChatPaneActions）は殻（ChatView）が useChatPaneActions で 1 回だけ作り、
 * 操作が読むいまの値はここで描くたびに shell.latest に入れる（メモの仕様書「0023_表示を軽くする」の M5）
 */
export function useChatView({ chat, project, focus, onOpenNew, beforeSend }: ChatViewInput, shell: ChatShellHandles) {
  const { pane, scroll, latest: latestRef } = shell;
  const { approvals, live: coreLive } = useChatDetailView(chat.id);
  const log = useChatLog(chat.id);
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
  // サブエージェントの一覧・入れ子・色・回答待ち（店の取り出し口 chatSelectors。右の欄のタブの印・サブエージェントの画面と同じ値を 1 回だけ作る）
  const { entries: subagents, tree } = useChatSubagents(chat.id);
  // カードが読むもの（変わったときだけ新しい値にし、カードだけが描き直る）
  const subagentsView = useChatSubagentsView(chat.id);
  // 流れの各項目の memo が効くよう、作業場所が変わらない間は同じ関数にする
  const rel = relativeOf(project?.repo_path);
  // 裏で動いているサブエージェント（作業を止めると一緒に止まる。古い Claude Code では一覧の知らせがないので、一覧の行から数える）
  const runningAgents = subagents.filter((s) => s.status === "running").length;
  // 流れに出すのは末尾（遠い発言へ移ったときは途中の一部分）。前に起動したサブエージェントは preface で数える
  const items = useMemo(() => groupEvents(log.events, undefined, { preface: log.preface, partialHead: log.headPartial }), [log.events, log.preface, log.headPartial]);
  // 自分の指示の一覧（指示の履歴・⌘⌥↑ / ↓・上に貼り付ける指示の帯・チャット欄の ↑ の呼び出し。記録が変わったときだけ作り直す）
  const prompts = promptListOf(events);
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
  // 開き直したとき: 前に読んでいた位置があり、そのあと新しい項目が届いていなければ、その位置から（届いていれば一番下。検索から開いたらその発言。U2）
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
    log: { hasEarlier: log.hasEarlier, focused: log.focused, paging: log.paging, ...paging },
    initial,
    onDrawn: () => pane.drawn.set(pane.drawn.get() + 1),
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
    const first = log.events[0]?.id;
    const shown = first !== undefined && (log.focused ? afterShow.eventId >= first && afterShow.eventId <= log.events.at(-1)!.id : afterShow.eventId >= log.tailStart);
    if (!shown) return;
    setAfterShow(null);
    afterShow.then();
  }, [afterShow, log]);
  // 失敗した作業の直し方（変わる様子として配り、失敗した作業の終わりの行だけが描き直る）
  const retry = useRetryChoices(events, busy, options);
  const send = useChatSend({ chatId: chat.id, busy, queued: live.queue.messages.length > 0, compactHold: compactHoldOf(live), options, scroll, background: live.background, runningAgents, onStopping: setStopClicked, beforeSend });

  // ⌘⌥↑ / ↓ で前後の指示へ（上に貼り付けた指示の帯の ↑ / ↓ も）
  // 指示の位置は、描いていない行も窓の前からの和で（箱の中の指示を見落とさない）。読み込んでいない範囲の指示は記録の順で前後を決める
  const loaded = log.events.length > 0 ? { first: log.events[0].id, last: log.focused ? log.events.at(-1)!.id : Number.MAX_SAFE_INTEGER } : null;
  const promptKeys = usePromptKeys({
    root: pane.root,
    timeline: scroll.ref,
    promptIds: prompts.ids,
    locate: (id) => timeline.topOf(`e${id}`),
    loaded,
    onJump: (id) => pane.jumpTo(id),
  });
  // 操作がいつも最新の値で動くよう、描くたびに入れ直す（操作そのものは作り直さない）
  // ピルの列を画面の外に描いているとき（メモのチャットの欄を閉じている）は、会話へ移る前に画面を見せる
  const chipsPortal = useChipsPortal();
  const latest: PaneLatest = {
    chat,
    log,
    options,
    tree,
    timeline,
    onOpenNew,
    stepPrompt: promptKeys.go,
    send,
    reveal: chipsPortal?.reveal,
    showAfter: (eventId, then) => setAfterShow({ eventId, then }),
  };
  // 描く中で ref に書かない（React Compiler の決まり）。描いた結果を当てる段で、どの effect よりも先に入れる
  useInsertionEffect(() => {
    latestRef.current = latest;
  });

  // 変わる様子を配る（変わったときだけ。読んでいる部品だけが描き直る）
  useLayoutEffect(() => {
    if (pane.state.get().retry !== retry) pane.state.set({ ...pane.state.get(), retry });
  }, [pane, retry]);

  return { log, approvals, options, busy, live, subagents, subagentsView, items, prompts, rel, timeline, send };
}
