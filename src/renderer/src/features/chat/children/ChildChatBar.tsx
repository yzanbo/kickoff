import { ArrowUpLeft, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat, ChatEvent } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { PopOutTabButton } from "@/features/panel/tabs/PopOutTabButton";
import { handBackText } from "./childChats";
import { handBackToParent, revealInParent } from "./openChild";

/**
 * 子チャットの上の帯（別ウィンドウ・右の欄で共通）: 親を見る（親の、聞いた発言へ）・メインに渡す（いちばん新しい答えを引用にして親の入力欄へ。送るのは自分で）。
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
  return (
    <div className="child-chat-bar">
      <span className="child-chat-bar-label">子チャット</span>
      <span className="child-chat-bar-title">{chatTitle(chat.title)}</span>
      <span className="spacer" />
      {chat.parent_chat_id !== null && (
        <>
          <button type="button" className="btn btn-sm" title="親のチャットの、聞いた位置を見る" onClick={() => revealInParent(chat)}>
            <ArrowUpLeft size={13} aria-hidden /> 親を見る
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!answerText}
            title="いちばん新しい答えを、引用として親のチャットの入力欄に入れる（送るのは自分で）"
            onClick={() => handBackToParent(chat, handBackText(chat, answerText))}
          >
            <Inbox size={13} aria-hidden /> メインに渡す
          </button>
        </>
      )}
      {extra}
      {/* 右の欄のタブのときだけ、右端に「別ウィンドウで開く」 */}
      <PopOutTabButton />
    </div>
  );
}
