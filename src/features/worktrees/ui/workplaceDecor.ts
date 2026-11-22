// worktrees が作業場所に添える飾り: ワークツリーの実行環境（ポートの帯）。札の説明にアプリの URL と対応表（db 5432 → 20101）
import type { WorkplaceDecor } from "@/foundation/ui/workplace/workplaceDecor";
import { worktreeEnvLines } from "./worktreeEnvText";

export const worktreeEnvDecor: WorkplaceDecor = {
  id: "worktrees-env",
  lines: (_projectId, path, list) => worktreeEnvLines((path && list?.find((w) => w.path === path)?.env) || null),
};
