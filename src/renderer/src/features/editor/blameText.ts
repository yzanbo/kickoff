import type { GitBlame, GitBlameCommit } from "@shared/types";
import { agoText, formatFullDateTime } from "@/lib/time";

/**
 * その行のコミット（1 から数える行。記録の行より後ろ（ファイルの終わりの空の行）・記録と行の数が合わないときは null。
 * 記録はファイルを保存した中身で取るので、書きかけで行の数が変わったときは出さない）
 */
export function blameAt(blame: GitBlame | null, lineNumber: number, lineCount: number): GitBlameCommit | null {
  if (!blame) return null;
  const extra = lineCount - blame.lines.length;
  if (extra !== 0 && extra !== 1) return null;
  const at = blame.lines[lineNumber - 1];
  return at === undefined ? null : (blame.commits[at] ?? null);
}

/** 行の右に出す 1 行（GitLens と同じ「誰, いつ • メッセージ」。自分なら「あなた」、まだコミットしていない行は「あなた, まだコミットしていない変更」） */
export function blameLabel(commit: GitBlameCommit, now = Date.now()): string {
  if (commit.uncommitted) return "あなた, まだコミットしていない変更";
  return `${commit.you ? "あなた" : commit.author}, ${agoText(commit.date, now)} • ${commit.summary}`;
}

/** 乗せたときの詳しい説明（Markdown。名前・メール・日時・メッセージ・短いハッシュ） */
export function blameHover(commit: GitBlameCommit, now = Date.now()): string {
  if (commit.uncommitted) return "**まだコミットしていない変更**\n\n保存した中身のうち、まだコミットしていない行です。";
  const escape = (text: string) => text.replace(/[\\`*_[\]<>]/g, "\\$&");
  return `**${escape(commit.author)}**${commit.you ? "（あなた）" : ""}　${escape(commit.email)}\n\n${formatFullDateTime(commit.date)}（${agoText(commit.date, now)}）\n\n${escape(commit.summary)}\n\n\`${commit.hash.slice(0, 8)}\``;
}
