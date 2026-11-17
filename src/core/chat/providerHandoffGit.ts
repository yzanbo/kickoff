import type { GitStatus } from "@shared/types";
import { gitStatus } from "../git/index.js";

/** Git の状態も資料として渡す。変更内容そのものは含めず、巨大な一覧は件数を添えて切る。 */
export async function providerHandoffGit(cwd: string, readStatus: (cwd: string) => Promise<GitStatus> = gitStatus): Promise<{ context: string; warning: string | null }> {
  try {
    const status = await readStatus(cwd);
    if (!status.repo) return { context: "作業場所の Git の状態を取得できませんでした（Git の作業ツリーではないか、確認できません）。", warning: "Git の状態を取得できませんでした" };
    const changes = [
      ...status.staged.map((item) => ({ area: "ステージ済み", ...item })),
      ...status.unstaged.map((item) => ({ area: "未ステージ", ...item })),
      ...status.conflicts.map((item) => ({ area: "競合", ...item })),
    ];
    const max = 500;
    const lines = [`Git のブランチ: ${status.branch ?? "（ブランチなし）"}`, `変更の一覧（${changes.length} 件）:`];
    for (const item of changes.slice(0, max)) lines.push(`- ${item.area} ${item.kind} ${JSON.stringify(item.path)}${item.old_path ? `（元: ${JSON.stringify(item.old_path)}）` : ""}`);
    if (changes.length > max) lines.push(`残り ${changes.length - max} 件は省略しました。必要なら Git の状態を確認してください。`);
    return { context: lines.join("\n"), warning: changes.length > max ? `Git の変更一覧は ${max} 件まで表示しました` : null };
  } catch {
    return { context: "作業場所の Git の状態を取得できませんでした。必要なら確認してください。", warning: "Git の状態を取得できませんでした" };
  }
}
