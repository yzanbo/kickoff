import { Archive, ArchiveRestore, MessagesSquare, Trash2 } from "lucide-react";
import { AGENT_STATE_LABELS, type AgentState, type Chat } from "@shared/types";
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
import { confirmArchiveChats, confirmDeleteChat, toggleArchiveChat } from "@/features/chat/chatActions";
import { modelDisplayName } from "@/features/chat/options/models";
import { DefaultOpenPlace, OpenPlaceButtons } from "@/features/chat/composer/OpenPlaceControls";
import { useChildChats, useKnownChat } from "@/stores/chats";
import { chatTitle } from "@/features/chat/chatTitle";
import { usePopover } from "@/ui/Popover";
import { ChipWord, ComposerChip } from "@/features/chat/composer/ComposerChip";
import { openChatOrChild, openChildChat } from "./openChild";
import { useNewChildFlash } from "./useNewChildFlash";

/** まだ終わっていない様子（まとめてアーカイブしない。作業中はコアが断り、回答待ちは答える必要がある） */
const UNFINISHED_STATES: ReadonlySet<AgentState> = new Set(["running", "needs_input"]);

/** ピルに数を添える様子（見てほしい順） */
const NOTICE_STATES = ["needs_input", "failed", "unread"] as const;

/**
 * 子チャットの札 1 つ（押すと設定の開き方（右の欄 / 別ウィンドウ）で開く）。AI が作った兄弟チャット・親のないチャットも同じ札で、
 * 兄弟チャットは子チャットと同じ開き方、親のないチャットはチャットのパネルで開く（openChatOrChild）
 */
function ChildChip({ chat }: { chat: Chat }) {
  const { stateOf } = useChatStates();
  const state = stateOf(chat);
  const kind = chat.parent_chat_id === null ? "チャット" : "子チャット";
  return (
    <button type="button" className={cx("child-chat-chip", `child-${state}`)} title={`${kind}「${chatTitle(chat.title)}」を開く`} onClick={() => openChatOrChild(chat)}>
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

/** AI が作った兄弟チャット・親のないチャットの札 1 つ（一覧にまだ届いていない・消されたものは出さない） */
function CreatedChip({ id }: { id: number }) {
  const chat = useKnownChat(id);
  return chat ? <ChildChip chat={chat} /> : null;
}

/**
 * 親の会話の、聞いた発言・返答の下に並べる子チャットの札（そこから聞いた子チャットだけ）と、その発言の作業で AI が create_chat で作った
 * 兄弟チャット・親のないチャットの札（created。「,」でつないだ ID。作った側の流れから見つけられるように。メモの仕様書「0019_AI の操作ツールの追加」の E）
 */
export function ChildChatMarks({ chatId, eventId, created }: { chatId: number; eventId: number; created?: string }) {
  const children = useChildChats().get(chatId)?.filter((c) => c.parent_event_id === eventId) ?? [];
  const others = created ? created.split(",").map(Number).filter((id) => !children.some((c) => c.id === id)) : [];
  if (children.length === 0 && others.length === 0) return null;
  return (
    <div className="child-chat-marks">
      {children.map((c) => (
        <ChildChip key={c.id} chat={c} />
      ))}
      {others.map((id) => (
        <CreatedChip key={id} id={id} />
      ))}
    </div>
  );
}

/**
 * 入力欄の上の「子チャット 2 件 · 1 件未読」（指示の履歴・サブエージェントと同じピルの列）。押すと子チャットの一覧（サブエージェントの一覧と同じ形の行:
 * 状態の印・名前・様子 · モデル · 最後に動いた時刻、右に「右で開く」「新規ウィンドウで開く」とアーカイブ・削除）を開く。行を押すと設定の開き方で開き、
 * 一覧の上で行を押したときの開き方（設定）を変えられ、その下の「完了した子チャットをアーカイブ」で作業中・回答待ちでないものをまとめてアーカイブする。会話を遡らなくても、答えが来たこととどこにあるかが分かる。
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
  // 完了した子チャット（作業中・回答待ちでないもの）。一覧の上のボタンでまとめてアーカイブする（サブエージェントの一覧と同じ。利用者の依頼）
  const finished = visible.filter((c) => !UNFINISHED_STATES.has(stateOf(c)));
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
        <>
          {/* 左の印: 回答待ち > 作業中（ほかに未読があれば緑の点を重ねる）> 失敗 > 未読 > 既読（すべてアーカイブ済みなら出さない） */}
          {visible.length > 0 && <StatusSlot {...summaryState(visible.map(stateOf))} />}
          {/* 狭い所でアイコンと数だけにするときの、子チャットの印（ふだんは出さない） */}
          <MessagesSquare size={14} className="chip-icon chip-short-icon" aria-hidden />
          <span>
            <ChipWord>{visible.length > 0 ? "子チャット " : "アーカイブ済みの子チャット "}</ChipWord>
            {visible.length > 0 ? visible.length : hidden.length}
            <ChipWord> 件</ChipWord>
          </span>
          {notices.map(({ state, count }) => (
            <span key={state} className={cx("child-chats-waiting", "chip-detail", `child-${state}`)}>
              {" "}
              · {count} 件{AGENT_STATE_LABELS[state]}
            </span>
          ))}
        </>
      }
      label="子チャット"
      chipClassName={flashing ? "child-chats-new" : undefined}
      // アーカイブ・戻す・削除の確かめのダイアログを押しても、一覧は閉じない
      ignore="dialog"
    >
      {places.length > 1 && <DefaultOpenPlace places={places} value={openIn} onChange={setOpenIn} />}
      {/* 確かめてから、まとめてアーカイブする（その子チャットの子も一緒に。チャットのまとめてアーカイブと同じ） */}
      <button type="button" className="subagent-archive-all" disabled={finished.length === 0} onClick={() => void confirmArchiveChats(finished)}>
        <Archive size={15} aria-hidden />
        完了した子チャットをアーカイブ
        {finished.length > 0 && <span className="muted">（{finished.length} 件）</span>}
      </button>
      {visible.length === 0 && <p className="muted small subagent-empty">表示中の子チャットはありません</p>}
      {visible.map(renderRow)}
      <ArchivedFold place="composer" foldKey="children" count={hidden.length} className="composer-archived">
        {hidden.map(renderRow)}
      </ArchivedFold>
    </ComposerChip>
  );
}
