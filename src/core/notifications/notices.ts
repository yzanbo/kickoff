// 通知の中身（純粋な関数）: チャットの完了・失敗・回答待ち・AI からの知らせと CI の失敗を、この Mac の通知の文と、スマホのプッシュの短い文にする。
// スマホのプッシュには会話の中身を載せない（チャットの名前と状態・本体の ID とチャットの ID だけ。押したら本体から読む）
import { UNTITLED_CHAT_TITLE, type Approval, type Chat, type CiFailure } from "@shared/types";

/** 押したときに開くもの */
export type NoticeTarget = { kind: "chat"; project_id: number; chat_id: number } | { kind: "ci"; project_id: number; run_id: number };

/** 何が起きたか */
export type NoticeKind = "completed" | "failed" | "approval" | "ci_failed" | "ai_notice";

/** この Mac の通知（Mac のアプリのメインプロセスが出す）とスマホのプッシュの両方の元 */
export interface Notice {
  kind: NoticeKind;
  target: NoticeTarget;
  /** この Mac の通知の文（プロジェクト名・失敗の理由を含む） */
  title: string;
  body: string;
  /** スマホのプッシュの短い文（チャットの名前と状態だけ） */
  push: { title: string; body: string };
}

/** 知らせに出すチャットの名前（子チャットは「子チャット: 」、メモのチャットは「メモ: 」を頭に） */
export function noticeChatName(chat: Pick<Chat, "title" | "parent_chat_id" | "memo_path">): string {
  const kind = chat.parent_chat_id !== null ? "子チャット: " : chat.memo_path !== null ? "メモ: " : "";
  return `${kind}${chat.title.trim() || UNTITLED_CHAT_TITLE}`;
}

const PUSH_STATUS: Record<NoticeKind, string> = {
  completed: "終わりました",
  failed: "失敗しました",
  approval: "回答を待っています",
  ci_failed: "CI が落ちました",
  ai_notice: "AI からの知らせ",
};

/** 作業が終わった・失敗した（作業中から変わったときだけ呼ぶ） */
export function chatNotice(chat: Chat, projectName: string): Notice | null {
  if (chat.status !== "completed" && chat.status !== "failed") return null;
  const name = noticeChatName(chat);
  const target: NoticeTarget = { kind: "chat", project_id: chat.project_id, chat_id: chat.id };
  if (chat.status === "completed") {
    return { kind: "completed", target, title: `✓ 完了: ${name}`, body: `${projectName} ・ AI の作業が終わりました`, push: { title: name, body: PUSH_STATUS.completed } };
  }
  return { kind: "failed", target, title: `✕ 失敗: ${name}`, body: `${projectName} ・ ${chat.error?.slice(0, 120) ?? "エラーで止まりました"}`, push: { title: name, body: PUSH_STATUS.failed } };
}

/** 回答待ち（ツールの承認・AI からの質問・再開するかの確かめ） */
export function approvalNotice(approval: Approval, chat: Chat | null, projectName: string): Notice {
  const name = chat ? noticeChatName(chat) : "チャット";
  const why =
    approval.kind === "reconnect"
      ? "通信が切れて止まりました。再開するか選んでください"
      : approval.kind === "usage_limit"
        ? "使用枠が戻りました。続きから再開するか選んでください"
        : approval.agent_id
          ? "サブエージェントが確認を待っています"
          : "AI が確認を待っています";
  return {
    kind: "approval",
    target: { kind: "chat", project_id: approval.project_id, chat_id: approval.chat_id },
    title: `回答待ち: ${name}`,
    body: `${projectName} ・ ${why}`,
    push: { title: name, body: PUSH_STATUS.approval },
  };
}

/**
 * AI からの知らせ（AI の notify_user。メモの仕様書「0019_AI の操作ツールの追加」の C）: この Mac の通知には本文を出し、
 * スマホのプッシュには本文を載せない（外のサーバーを通るため。チャットの名前と「AI からの知らせ」だけ。押すと Kickoff の中で読む）
 */
export function aiNotice(chat: Chat, message: string, projectName: string): Notice {
  const name = noticeChatName(chat);
  return {
    kind: "ai_notice",
    target: { kind: "chat", project_id: chat.project_id, chat_id: chat.id },
    title: `AI からの知らせ: ${name}`,
    body: `${projectName} ・ ${message}`,
    push: { title: name, body: PUSH_STATUS.ai_notice },
  };
}

/** 見張っているブランチの CI が落ちた */
export function ciNotice(failure: CiFailure, projectName: string): Notice {
  return {
    kind: "ci_failed",
    target: { kind: "ci", project_id: failure.project_id, run_id: failure.run_id },
    title: `✕ CI が落ちました: ${failure.branch}`,
    body: `${projectName} ・ ${failure.workflow} #${failure.number}「${failure.title}」`,
    push: { title: projectName, body: `${PUSH_STATUS.ci_failed}（${failure.branch}）` },
  };
}
