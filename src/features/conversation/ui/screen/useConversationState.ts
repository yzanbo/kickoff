import { useInsertionEffect, useLayoutEffect } from "react";
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { relativeOf } from "@/features/chat/ui";
import { useChatSubagentsView } from "@/features/subagents/ui";
import { useRetryChoices } from "@/features/conversation/ui/rewind/useRetryChoices";
import { useConversationTimeline } from "@/features/conversation/ui/timeline/useConversationTimeline";
import type { ChatShellHandles } from "./useChatShell";
import { useChatSending } from "./useChatSending";

export interface ConversationInput {
  chat: Chat;
  project?: Project;
  /** 検索結果から開いたとき、スクロールして強調する発言（イベント ID） */
  focus?: number;
  /** 送る前にすること（ノートのチャットで、書きかけのノートを保存してから送る） */
  beforeSend?: () => Promise<void>;
}

/**
 * 1 つのチャットの会話の欄（ChatColumn）の状態: 選択（モデル・深さ・権限）と作業中の様子・送り方（useChatSending）・サブエージェント・
 * 流れ（useConversationTimeline）・失敗した作業の直し方。会話の欄は隠すと止まる Activity の中なので、隠れている間は記録が届いても描き直さない。
 * 子の部品に配る口は殻（ChatShell）が useChatShell で 1 回だけ作り、口が読む描いた値（窓・送り方・直し方）はここで描くたびに入れる
 */
export function useConversationState({ chat, project, focus, beforeSend }: ConversationInput, shell: ChatShellHandles) {
  const { options, busy, live, send } = useChatSending(chat, shell.scroll, beforeSend);
  // カードが読むもの（変わったときだけ新しい値にし、カードだけが描き直る）
  const subagentsView = useChatSubagentsView(chat.id);
  // 流れの各項目の memo が効くよう、作業場所が変わらない間は同じ関数にする
  const rel = relativeOf(project?.repo_path);
  const { timeline, prompts, windowPort } = useConversationTimeline(chat.id, focus, shell);
  // 失敗した作業の直し方（変わる様子として配り、失敗した作業の終わりの行だけが描き直る）
  const retry = useRetryChoices(chat.id, busy, options);
  // 口がいつも最新の値で動くよう、描くたびに入れ直す（口そのものは作り直さない）
  // 描く中で外の値を書かない（React Compiler の決まり）。描いた結果を当てる段で、どの effect よりも先に入れる
  useInsertionEffect(() => {
    shell.setWindow(windowPort);
    shell.setSend({ options, sendOther: send.onSendOther });
  });
  useLayoutEffect(() => {
    shell.rewind.choices.set(retry);
  }, [shell, retry]);
  return { options, live, subagentsView, prompts, rel, timeline, send };
}
