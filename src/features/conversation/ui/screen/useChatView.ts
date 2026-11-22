import { useEffect, useInsertionEffect, useLayoutEffect, useRef, useState } from "react";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { chatLog, chatWindow, relativeOf, timelineView } from "@/features/chat/ui";
import { useChatSubagentsView } from "@/features/subagents/ui";
import { promptList } from "@/features/conversation/ui/promptList/selectors";
import { usePromptKeys } from "@/features/conversation/ui/promptList/usePromptKeys";
import { useRetryChoices } from "@/features/conversation/ui/rewind/useRetryChoices";
import { timelineItems } from "@/features/conversation/ui/timeline/selectors";
import { useTimelineWindow } from "@/features/conversation/ui/timeline/useTimelineWindow";
import type { ChatShellHandles } from "./useChatShell";
import { useChatSending } from "./useChatSending";

export interface ChatViewInput {
  chat: Chat;
  project?: Project;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** 送る前にすること（ノートのチャットで、書きかけのノートを保存してから送る） */
  beforeSend?: () => Promise<void>;
}

/**
 * 1 つのチャットの会話の欄（ChatColumn）の状態: 選択（モデル・深さ・権限）・作業中の様子・サブエージェント・流れ（窓とスクロール）・
 * 自分の指示の一覧・送り方。記録・回答待ち・作業中の様子はチャットの店の口をここで読む（会話の欄は隠すと止まる Activity の中なので、
 * 隠れている間は記録が届いても描き直さない）。子の部品に配る口は殻（ChatShell）が useChatShell で 1 回だけ作り、
 * 口が読む描いた値（窓・送り方）はここで描くたびに入れる
 */
export function useChatView({ chat, project, focus, beforeSend }: ChatViewInput, shell: ChatShellHandles) {
  const { scroll } = shell;
  // 流れに出す記録の範囲と読み足しの様子（記録の配列は読まず、要るものを取り出し口で読む）
  const log = chatWindow.useFor(chat.id);
  const { options, busy, live, send } = useChatSending(chat, scroll, beforeSend);
  // カードが読むもの（変わったときだけ新しい値にし、カードだけが描き直る）
  const subagentsView = useChatSubagentsView(chat.id);
  // 流れの各項目の memo が効くよう、作業場所が変わらない間は同じ関数にする
  const rel = relativeOf(project?.repo_path);
  // 流れに出すのは末尾（遠い発言へ移ったときは途中の一部分）。前に起動したサブエージェントは preface で数える
  const items = timelineItems.useFor(chat.id);
  // 自分の指示の一覧（指示の履歴・⌘⌥↑ / ↓・上に貼り付ける指示の帯・チャット欄の ↑ の呼び出し。記録全体から作る取り出し口）
  const prompts = promptList.useFor(chat.id);
  // 流れは最近の項目だけを描く（長いチャットでも軽くする。検索・移り先は、その前後だけを描く）
  const chatId = chat.id;
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
  // 失敗した作業の直し方（変わる様子として配り、失敗した作業の終わりの行だけが描き直る）
  const retry = useRetryChoices(chat.id, busy, options);

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
  // 口がいつも最新の値で動くよう、描くたびに入れ直す（口そのものは作り直さない）
  // 描く中で外の値を書かない（React Compiler の決まり）。描いた結果を当てる段で、どの effect よりも先に入れる
  useInsertionEffect(() => {
    shell.setWindow({ revealEvent: timeline.revealEvent, stepPrompt: promptKeys.go, showAfter: (eventId, then) => setAfterShow({ eventId, then }) });
    shell.setSend({ options, sendOther: send.onSendOther });
  });

  // 失敗した作業の直し方を配る（変わったときだけ。読んでいる部品だけが描き直る）
  useLayoutEffect(() => {
    shell.rewind.choices.set(retry);
  }, [shell, retry]);

  return { options, busy, live, subagentsView, prompts, rel, timeline, send };
}
