import { useProviders } from "@/stores/providers";

/** 対応予定の札（設定の「接続」「使用状況」・プロジェクトの設定の「AI」で同じ言葉にする） */
export const PLANNED_BADGE = "対応予定";

/**
 * まだ Kickoff のチャットで使えない（対応予定の）AI（いまは Codex・Gemini）。
 * ids: 対応予定の AI の ID（使用状況のサービスの ID とも同じ）。
 * note: 今後の対応予定であることの説明（対応予定のものがなければ null）
 */
export function usePlannedProviders(): { ids: ReadonlySet<string>; note: string | null } {
  const providers = useProviders();
  const planned = (providers.data ?? []).filter((p) => !p.implemented);
  return {
    ids: new Set(planned.map((p) => p.id)),
    note: planned.length > 0 ? `${planned.map((p) => p.label).join("・")} は今後の対応予定です。まだ Kickoff のチャットでは使えません。` : null,
  };
}
