import { ArrowUpLeft, ChevronRight, Inbox } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { childDepthLabel } from "@shared/chat/childDepth";
import type { Chat, ChatEvent } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { PopOutTabButton } from "@/features/panel/tabs/PopOutTabButton";
import { useChatStates } from "@/app/chatStatesContext";
import { knownChat, useChatsValue, useKnownChat } from "@/stores/chats";
import { ancestorsOf, handBackText } from "./childChats";
import { handBackToParent, revealInParent } from "./openChild";

/** 系譜を出す数（これより深ければ、根と親の間を「…」にまとめる） */
const MAX_CRUMBS = 2;

/**
 * 子チャットの上の帯（別ウィンドウ・右の欄で共通）: 左に親チャットまでの系譜（根 › … › 親 › この子チャット。親は状態の印と名前の札で、
 * 押すとその親の、聞いた発言へ）と、深さの呼び名（子・孫・ひ孫チャット）・右にメインに渡す（いちばん新しい答えを引用にして親の入力欄へ。送るのは自分で）。
 * 閉じるのは、右の欄はタブの ×、別ウィンドウは ✕・最小化（子チャットは残り、親の会話の札から開き直せる）
 */
export function ChildChatBar({
  chat,
  events,
  extra,
}: {
  chat: Chat;
  events: readonly ChatEvent[];
  /** 右の端に足すボタン（別ウィンドウの「右の欄に戻す」） */
  extra?: ReactNode;
}) {
  // いちばん新しいメインの AI の返答（サブエージェントの文は除く）
  const answer = [...events].reverse().find((e) => e.type === "text" && !e.data.parent);
  const answerText = answer?.type === "text" ? answer.data.text : "";
  // 祖先の ID（根 → 親。親の名前・状態は札ごとに引くので、ここでは ID の並びが変わったときだけ描き直す）
  const ancestorKey = useChatsValue(() => ancestorsOf(chat, knownChat).map((c) => c.id).join(",")) ?? "";
  const ancestors = ancestorKey ? ancestorKey.split(",").map(Number) : [];
  const depth = Math.max(ancestors.length, 1);
  // 札ごとに、押したときに見せる「聞いた位置」は、その札のすぐ下の子のもの
  const crumbs = ancestors.map((id, i) => ({ id, below: ancestors[i + 1] ?? chat.id }));
  const shown = crumbs.length > MAX_CRUMBS ? [crumbs[0], null, ...crumbs.slice(-(MAX_CRUMBS - 1))] : crumbs;
  return (
    <div className="child-chat-bar">
      {chat.parent_chat_id !== null && (
        <nav className="child-chat-lineage" aria-label="親チャット">
          <span className="child-chat-lineage-lead" aria-hidden>
            <ArrowUpLeft size={13} />
            <span className="child-chat-lineage-lead-text">親</span>
          </span>
          {shown.length === 0 ? (
            // 親が読み込んだ一覧にない（アーカイブ済みなど）: 名前は出さずに開くだけ
            <button type="button" className="child-chat-crumb" data-tip="親のチャットの、聞いた位置を見る" onClick={() => revealInParent(chat)}>
              親のチャット
            </button>
          ) : (
            shown.map((crumb, i) => {
              const item = crumb ? <ParentCrumb id={crumb.id} belowId={crumb.below} current={chat} /> : <span className="muted">…</span>;
              const sep = <ChevronRight size={12} className="child-chat-lineage-sep" aria-hidden />;
              // 親より上（根の側）は、狭い帯では隠して親だけを残す（.child-chat-lineage-up）
              return i < shown.length - 1 ? (
                <span key={crumb?.id ?? "more"} className="child-chat-lineage-up">
                  {item}
                  {sep}
                </span>
              ) : (
                <Fragment key={crumb?.id ?? "more"}>
                  {item}
                  {sep}
                </Fragment>
              );
            })
          )}
          {shown.length === 0 && <ChevronRight size={12} className="child-chat-lineage-sep" aria-hidden />}
        </nav>
      )}
      {/* 深さで呼び名と色を変える（子・孫・ひ孫。親が読み込んだ一覧になければ子として出す） */}
      <span className={`child-chat-bar-label child-depth-${Math.min(depth, 3)}`}>{childDepthLabel(depth)}</span>
      <span className="child-chat-bar-title">{chatTitle(chat.title)}</span>
      <span className="spacer" />
      {chat.parent_chat_id !== null && (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!answerText}
          title="いちばん新しい答えを、引用として親のチャットの入力欄に入れる（送るのは自分で）"
          onClick={() => handBackToParent(chat, handBackText(chat, answerText))}
        >
          <Inbox size={13} aria-hidden />
          <span className="child-chat-hand-back-text">メインに渡す</span>
        </button>
      )}
      {extra}
      {/* 右の欄のタブのときだけ、右端に「別ウィンドウで開く」 */}
      <PopOutTabButton />
    </div>
  );
}

/** 系譜の親の札（状態の印と名前）。押すと、その親の会話の、すぐ下の子を聞いた位置へ */
function ParentCrumb({ id, belowId, current }: { id: number; belowId: number; current: Chat }) {
  const parent = useKnownChat(id);
  const { stateOf } = useChatStates();
  if (!parent) return null;
  const name = chatTitle(parent.title);
  const below = belowId === current.id ? current : knownChat(belowId);
  return (
    <button
      type="button"
      className="child-chat-crumb"
      data-tip={`親のチャット「${name}」の、聞いた位置を見る`}
      onClick={() => below && revealInParent(below)}
    >
      <StatusSlot state={stateOf(parent)} />
      <span className="child-chat-crumb-name">{name}</span>
    </button>
  );
}
