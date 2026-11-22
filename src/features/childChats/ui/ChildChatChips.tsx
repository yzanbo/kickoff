import { MessagesSquare } from "lucide-react";
import { STATE_LOOKS, summarizeStates } from "@shared/chat/stateLooks";
import type { AgentState, Chat } from "@shared/chat/types";
import { cx } from "@/foundation/ui/lib/cx";
import { relativeTime } from "@/foundation/ui/lib/time";
import { CHILD_CHAT_OPEN_IN } from "@/foundation/ui/storage/storageKeys";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { usePopover } from "@/foundation/ui/kit/Popover";
import { ModelName } from "@/features/ai/ui";
import { AgentListChip, ChatStateMark, chatTitle, confirmArchiveChats, confirmDeleteChats, descendantStates, openChat, summaryState, useChatStates, useChildChats, usePlaceCaps, type AgentListRow } from "@/features/chat/ui";
import { useNewChildFlash } from "./useNewChildFlash";

/** まだ終わっていない様子（まとめてアーカイブしない。作業中はコアが断り、回答待ちは答える必要がある） */
const UNFINISHED_STATES: ReadonlySet<AgentState> = new Set(["running", "needs_input"]);

/** ピルに数を添える様子（見てほしい順） */
const NOTICE_STATES = ["needs_input", "failed", "unread"] as const;

/**
 * 入力欄の上の「子チャット 2 件 · 1 件未読」（指示の履歴・サブエージェントと同じピルの列）。押すと子チャットの一覧（サブエージェントの一覧と同じ形の行:
 * 状態の印・名前・様子 · モデル · 最後に動いた時刻、右に「右で開く」「新規ウィンドウで開く」とアーカイブ・削除）を開く。行を押すと設定の開き方で開き、
 * 一覧の上で行を押したときの開き方（設定）を変えられ、その下の「完了した子チャットをアーカイブ」で作業中・回答待ちでないものをまとめてアーカイブする。会話を遡らなくても、答えが来たこととどこにあるかが分かる。
 * アーカイブした子チャットは一覧と件数から外し、いちばん下の閉じたまとまり「アーカイブ済み n」（ArchivedFold。サイドバー・サブエージェントの一覧と同じ）を開いて戻せる（すべてアーカイブしていれば
 * ピルは「アーカイブ済みの子チャット n 件」）。子チャットが新しくできたら、少しの間ピルを光らせる（useNewChildFlash）。数えるのは直接の子だけ
 */
export function ChildChatsChip({ chatId }: { chatId: number }) {
  // アーカイブ済みも数えるので、アーカイブ済みの一覧も読む（全プロジェクトで 1 回だけ読み、知らせで直す）
  const childrenOf = useChildChats({ archived: true });
  const children = childrenOf.get(chatId);
  const { stateOf } = useChatStates();
  const popover = usePopover();
  const [openIn, setOpenIn] = useSetting(CHILD_CHAT_OPEN_IN);
  // 別ウィンドウは Mac のアプリだけ
  const { canWindow } = usePlaceCaps();
  // 子チャットが新しくできたら、少しの間ピルを光らせる（開かない設定でも、作ったことと置き場所が分かる）
  const flashing = useNewChildFlash(children);
  if (!children?.length) return null;
  const visible = children.filter((c) => !c.archived_at);
  const hidden = children.filter((c) => c.archived_at);
  // 見てほしい子チャットの数を、様子ごとに分けて添える（回答待ち → 失敗 → 未読。3 つをまとめて「答えあり」と数えると、回答待ちも「答えあり」に見える）
  const states = descendantStates(chatId, (id) => childrenOf.get(id), stateOf, { depth: 1 });
  const { counts } = summarizeStates(states);
  const notices = NOTICE_STATES.filter((state) => counts[state] > 0);
  const places = canWindow ? (["side", "window"] as const) : (["side"] as const);
  const byKey = new Map(children.map((c) => [String(c.id), c]));
  const rowOf = (c: Chat): AgentListRow => {
    const state = stateOf(c);
    return {
      key: String(c.id),
      name: chatTitle(c.title),
      icon: <MessagesSquare size={16} aria-hidden />,
      title: (
        <>
          <ChatStateMark chat={c} />
          {chatTitle(c.title)}
        </>
      ),
      meta: (
        <>
          <span className={cx("child-chat-row-state", `child-${state}`)}>{STATE_LOOKS[state].label}</span>
          {c.model && (
            <>
              {" · "}
              <ModelName provider={c.provider} model={c.model} />
            </>
          )}
          {` · ${relativeTime(c.active_at)}`}
        </>
      ),
      tip: `子チャット「${chatTitle(c.title)}」を開く`,
      className: "child-chat-row",
      archived: Boolean(c.archived_at),
      // アーカイブ・戻す・削除はチャットと同じ（確かめてから。その子チャットの子も一緒に。作業中はできないので出さない）
      canArchive: state !== "running",
      ...(state !== "running" ? { onDelete: () => void confirmDeleteChats(c) } : {}),
    };
  };
  const withChat = (key: string, run: (chat: Chat) => void) => {
    const chat = byKey.get(key);
    if (chat) run(chat);
  };
  return (
    <AgentListChip
      noun="子チャット"
      icon={MessagesSquare}
      popover={popover}
      shown={visible.length}
      archivedCount={hidden.length}
      mark={summaryState(states)}
      details={notices.map((state) => (
        <span key={state} className={cx("child-chats-waiting", "chip-detail", `child-${state}`)}>
          {" "}
          · {counts[state]} 件{STATE_LOOKS[state].label}
        </span>
      ))}
      list={() => ({
        rows: visible.map(rowOf),
        archived: hidden.map(rowOf),
        // 完了した子チャット（作業中・回答待ちでないもの）。一覧の上のボタンでまとめてアーカイブする（サブエージェントの一覧と同じ）
        finished: visible.filter((c) => !UNFINISHED_STATES.has(stateOf(c))).map((c) => String(c.id)),
      })}
      places={places}
      openIn={openIn}
      onOpenIn={setOpenIn}
      onOpen={(key, place) => withChat(key, (c) => openChat(c, place))}
      // 確かめてから、まとめてアーカイブする（その子チャットの子も一緒に。チャットのまとめてアーカイブと同じ）
      onArchive={(keys) => void confirmArchiveChats(keys.flatMap((k) => byKey.get(k) ?? []))}
      onRestore={(key) => withChat(key, (c) => void confirmArchiveChats(c))}
      foldKey="children"
      flashing={flashing}
    />
  );
}
