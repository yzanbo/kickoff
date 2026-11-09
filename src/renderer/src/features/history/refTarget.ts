import type { GitRefs } from "@shared/types";

/**
 * 右クリックしたブランチ・タグ（branch = 手元のブランチ / remote = リモートのブランチ "origin/main" / tag = タグ）。
 * worktree は左の一覧のワークツリーの行から開いたとき、そのワークツリーのフォルダ（メニューにワークツリーの項目も出す）
 */
export type RefTarget = { kind: "branch" | "remote" | "tag"; name: string; worktree?: string };

/** 札の文（"HEAD -> main"・"tag: v1"・"origin/main"・"feature/x"）が、手元のブランチ・リモートのブランチ・タグのどれか（一覧で引き当てる） */
export function refTargetOf(ref: string, refs: GitRefs | undefined): RefTarget | null {
  if (ref.startsWith("HEAD -> ")) return { kind: "branch", name: ref.slice(8) };
  if (ref.startsWith("tag: ")) return { kind: "tag", name: ref.slice(5) };
  if (ref === "HEAD" || ref.endsWith("/HEAD")) return null;
  if (refs?.branches.some((b) => b.name === ref)) return { kind: "branch", name: ref };
  if (refs?.remotes.some((r) => r.branches.some((b) => b.name === ref))) return { kind: "remote", name: ref };
  return { kind: ref.includes("/") ? "remote" : "branch", name: ref };
}
