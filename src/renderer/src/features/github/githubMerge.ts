// PR のマージ・チェックアウトの確認で出す注意と、マージの方式の決め方（純粋な関数。要件 5.11 の段階 3 の「マージの守り」・決定 ⑧）
import type { GitHubMergeMethod, GitHubPullDetail } from "@shared/types";

/** 確認の中で目立たせる注意（danger = マージできない見込みが高い・取り返しにくい / warn = 確かめてほしい） */
export interface MergeWarning {
  level: "danger" | "warn";
  text: string;
}

/** 落ちたとみなすチェックの状態 */
const FAILED = new Set(["failure", "error", "cancelled", "timed_out", "action_required", "startup_failure"]);

/** CI が落ちている・途中・承認がない・変更依頼・ブランチが古い・衝突・保護ルール・下書きを、確認で目立たせる注意にする */
export function mergeWarnings(detail: Pick<GitHubPullDetail, "checks" | "mergeable" | "merge_state" | "item">): MergeWarning[] {
  const out: MergeWarning[] = [];
  const failed = detail.checks.filter((c) => FAILED.has(c.state));
  const pending = detail.checks.filter((c) => c.state === "pending");
  if (detail.item.is_draft || detail.merge_state === "draft") out.push({ level: "danger", text: "下書きの PR です。レビューできる状態にしてからマージしてください" });
  if (detail.mergeable === "conflicting" || detail.merge_state === "dirty") out.push({ level: "danger", text: "base のブランチと衝突しています。衝突を解いてからでないとマージできません" });
  if (failed.length > 0) out.push({ level: "danger", text: `CI のチェックが ${failed.length} 件落ちています（${failed.map((c) => c.name).slice(0, 3).join("、")}${failed.length > 3 ? " など" : ""}）` });
  if (pending.length > 0) out.push({ level: "warn", text: `CI のチェックが ${pending.length} 件まだ終わっていません` });
  if (detail.item.review_decision === "changes_requested") out.push({ level: "danger", text: "レビューで変更を依頼されています" });
  if (detail.item.review_decision === "review_required") out.push({ level: "warn", text: "必要な承認がまだありません" });
  if (detail.merge_state === "behind") out.push({ level: "warn", text: "ブランチが base より古くなっています（base の新しいコミットを取り込んでいません）" });
  if (detail.merge_state === "blocked" && out.length === 0) out.push({ level: "warn", text: "GitHub の保護ルールでマージが止められている見込みです（必要な承認・チェックなど）" });
  if (detail.merge_state === "unstable" && failed.length === 0) out.push({ level: "warn", text: "必須でないチェックが通っていません" });
  return out;
}

/** 選ぶ方式: 前回のものをリポジトリが許していればそれ、なければ許すものの初め（どれも許していなければ null） */
export function pickMergeMethod(remembered: GitHubMergeMethod | null, allowed: GitHubMergeMethod[]): GitHubMergeMethod | null {
  if (remembered && allowed.includes(remembered)) return remembered;
  return allowed[0] ?? null;
}

/** 本体に取り出す前に知らせること（まだコミットしていない変更・本体で作業中のチャット。純粋な関数） */
export function mainCheckoutNotes(changes: number, running: string[]): string[] {
  return [
    ...(changes > 0 ? [`・本体にまだコミットしていない変更が ${changes} ファイルあります。切り替えた先のブランチへそのまま持っていきます（ぶつかるときは Git が断ります）。`] : []),
    ...(running.length > 0 ? [`・本体で作業中のチャットがあります（${running.slice(0, 3).join("、")}${running.length > 3 ? " など" : ""}）。ファイルが途中で入れ替わります。`] : []),
  ];
}
