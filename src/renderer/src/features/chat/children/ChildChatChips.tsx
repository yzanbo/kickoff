import { Archive, ArchiveRestore, MessagesSquare, Trash2 } from "lucide-react";
import { AGENT_STATE_LABELS, type Chat } from "@shared/types";
import { busyWithUnread } from "@shared/chat/state";
import { useChatStates } from "@/app/chatStatesContext";
import { cx } from "@/lib/cx";
import { relativeTime } from "@/lib/time";
import { CHILD_CHAT_OPEN_IN } from "@/lib/storageKeys";
import { useSetting } from "@/hooks/useSetting";
import { canPopout } from "@/app/popout";
import { useModels } from "@/stores/providers";
import { ArchivedFold } from "@/ui/ArchivedFold";
import { IconButton } from "@/ui/IconButton";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { summaryState } from "@/features/chat/chatState";
import { confirmDeleteChat, toggleArchiveChat } from "@/features/chat/chatActions";
import { modelDisplayName } from "@/features/chat/options/models";
import { DefaultOpenPlace, OpenPlaceButtons } from "@/features/chat/composer/OpenPlaceControls";
import { useChildChats } from "@/stores/chats";
import { chatTitle } from "@/features/chat/chatTitle";
import { usePopover } from "@/ui/Popover";
import { ComposerChip } from "@/features/chat/composer/ComposerChip";
import { openChildChat } from "./openChild";
import { useNewChildFlash } from "./useNewChildFlash";

/** ピルに数を添える様子（見てほしい順） */
const NOTICE_STATES = ["needs_input", "failed", "unread"] as const;

/** 子チャットの札 1 つ（押すと設定の開き方（右の欄 / 別ウィンドウ）で開く） */
function ChildChip({ chat }: { chat: Chat }) {
  const { stateOf } = useChatStates();
  const state = stateOf(chat);
  return (
    <button type="button" className={cx("child-chat-chip", `child-${state}`)} title={`子チャット「${chatTitle(chat.title)}」を開く`} onClick={() => openChildChat(chat)}>
      <MessagesSquare size={12} aria-hidden />
      <span className="child-chat-chip-title">{chatTitle(chat.title)}</span>
      <span className="child-chat-chip-state">
        {/* 状態の印はサイドバーの行・タブと同じ（作業中のリング・回答待ちの！・未読と失敗の点） */}
        <StatusSlot state={state} unread={busyWithUnread(chat, state)} />
        {AGENT_STATE_LABELS[state]}
      </span>
    </button>
  );
}

/** 親の会話の、聞いた発言・返答の下に並べる子チャットの札（そこから聞いた子チャットだけ） */
export function ChildChatMarks({ chatId, eventId }: { chatId: number; eventId: number }) {
  const children = useChildChats().get(chatId)?.filter((c) => c.parent_event_id === eventId);
  if (!children?.length) return null;
  return (
    <div className="child-chat-marks">
      {children.map((c) => (
        <ChildChip key={c.id} chat={c} />
      ))}
    </div>
  );
}

/**
 * 入力欄の上の「子チャット 2 件 · 1 件未読」（指示の履歴・サブエージェントと同じピルの列）。押すと子チャットの一覧（サブエージェントの一覧と同じ形の行:
 * 状態の印・名前・様子 · モデル · 最後に動いた時刻、右に「右で開く」「新規ウィンドウで開く」とアーカイブ・削除）を開く。行を押すと設定の開き方で開き、
 * 一覧の上で行を押したときの開き方（設定）を変えられる。会話を遡らなくても、答えが来たこととどこにあるかが分かる。
 * アーカイブした子チャットは一覧と件数から外し、いちばん下の閉じたまとまり「アーカイブ済み n」（ArchivedFold。サイドバー・サブエージェントの一覧と同じ）を開いて戻せる（すべてアーカイブしていれば
 * ピルは「アーカイブ済みの子チャット n 件」）。子チャットが新しくできたら、少しの間ピルを光らせる（useNewChildFlash）
 */
export function ChildChatsChip({ chatId }: { chatId: number }) {
  // アーカイブ済みも数えるので、アーカイブ済みの一覧も読む（全プロジェクトで 1 回だけ読み、知らせで直す）
  const children = useChildChats({ archived: true }).get(chatId);
  const { stateOf } = useChatStates();
  const models = useModels();
  const popover = usePopover();
  const [openIn, setOpenIn] = useSetting(CHILD_CHAT_OPEN_IN);
  // 子チャットが新しくできたら、少しの間ピルを光らせる（開かない設定でも、作ったことと置き場所が分かる）
  const flashing = useNewChildFlash(children);
  if (!children?.length) return null;
  const visible = children.filter((c) => !c.archived_at);
  const hidden = children.filter((c) => c.archived_at);
  // 見てほしい子チャットの数を、様子ごとに分けて添える（回答待ち → 失敗 → 未読。前は 3 つをまとめて「答えあり」と数え、回答待ちも「答えあり」に見えた）
  const notices = NOTICE_STATES.map((state) => ({ state, count: visible.filter((c) => stateOf(c) === state).length })).filter((n) => n.count > 0);
  // 別ウィンドウは Mac のアプリだけ
  const places = canPopout() ? (["side", "window"] as const) : (["side"] as const);
  const open = (chat: Chat, place?: "side" | "window") => {
    popover.close();
    openChildChat(chat, place);
  };
  const renderRow = (c: Chat) => {
    const state = stateOf(c);
    const meta = [modelDisplayName(models, c.model), relativeTime(c.active_at)].filter(Boolean);
    return (
      <div
        key={c.id}
        role="button"
        tabIndex={0}
        className={cx("subagent-row child-chat-row", c.archived_at && "archived")}
        title={`子チャット「${chatTitle(c.title)}」を開く`}
        onClick={() => open(c)}
        onKeyDown={(e) => e.key === "Enter" && open(c)}
      >
        <span className="subagent-icon">
          <MessagesSquare size={16} aria-hidden />
        </span>
        <span className="subagent-text">
          <span className="subagent-title">
            <StatusSlot state={state} />
            {chatTitle(c.title)}
          </span>
          <span className="subagent-meta">
            <span className={cx("child-chat-row-state", `child-${state}`)}>{AGENT_STATE_LABELS[state]}</span>
            {meta.map((m) => ` · ${m}`).join("")}
          </span>
        </span>
        <OpenPlaceButtons places={places} onOpen={(place) => open(c, place === "window" ? "window" : "side")} />
        {/* アーカイブ・戻す・削除はチャットと同じ（確かめてから。その子チャットの子も一緒に。作業中はできないので出さない） */}
        {c.archived_at ? (
          <IconButton
            icon={ArchiveRestore}
            label={`${chatTitle(c.title)} を一覧に戻す`}
            title="一覧に戻す"
            className="subagent-row-action"
            type="button"
            onClick={(e) => (e.stopPropagation(), void toggleArchiveChat(c))}
          />
        ) : (
          state !== "running" && (
            <IconButton
              icon={Archive}
              label={`${chatTitle(c.title)} をアーカイブ`}
              title="アーカイブ"
              className="subagent-row-action"
              type="button"
              onClick={(e) => (e.stopPropagation(), void toggleArchiveChat(c))}
            />
          )
        )}
        {state !== "running" && (
          <IconButton
            icon={Trash2}
            label={`${chatTitle(c.title)} を削除`}
            title="削除（会話の記録も消えます）"
            className="subagent-row-action"
            type="button"
            onClick={(e) => (e.stopPropagation(), void confirmDeleteChat(c))}
          />
        )}
      </div>
    );
  };
  return (
    <ComposerChip
      popover={popover}
      chip={
        visible.length > 0 ? (
          <>
            {/* 左の印: 回答待ち > 作業中（ほかに未読があれば緑の点を重ねる）> 失敗 > 未読 > 既読 */}
            <StatusSlot {...summaryState(visible.map(stateOf))} />
            子チャット {visible.length} 件
            {notices.map(({ state, count }) => (
              <span key={state} className={cx("child-chats-waiting", `child-${state}`)}>
                {" "}
                · {count} 件{AGENT_STATE_LABELS[state]}
              </span>
            ))}
          </>
        ) : (
          `アーカイブ済みの子チャット ${hidden.length} 件`
        )
      }
      label="子チャット"
      chipClassName={flashing ? "child-chats-new" : undefined}
      // アーカイブ・戻す・削除の確かめのダイアログを押しても、一覧は閉じない
      ignore="dialog"
    >
      {places.length > 1 && <DefaultOpenPlace places={places} value={openIn} onChange={setOpenIn} />}
      {visible.length === 0 && <p className="muted small subagent-empty">表示中の子チャットはありません</p>}
      {visible.map(renderRow)}
      <ArchivedFold place="composer" foldKey="children" count={hidden.length} className="composer-archived">
        {hidden.map(renderRow)}
      </ArchivedFold>
    </ComposerChip>
  );
}
