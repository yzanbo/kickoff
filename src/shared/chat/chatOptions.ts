// 新しいチャットの既定のモデル・推論の深さ・権限モード・ファストモード（コアと画面で共通。Node 依存を持ち込まないこと）
import type { AppSettings, ProjectDefaults } from "@shared/types";

/**
 * 新しいチャットの既定（プロジェクトの既定 → アプリ全体の設定の順に、最初に決まっているもの）。
 * 推論の深さの null は「指定しない」（SDK とモデルの既定に任せる）。権限モードは設定の既定が「毎回確認」
 */
export function resolveRunDefaults(settings: AppSettings, defaults: ProjectDefaults = {}) {
  return {
    model: defaults.model ?? settings.claudeModel,
    effort: defaults.effort !== undefined ? defaults.effort : settings.defaultEffort,
    permission: defaults.permission ?? settings.defaultPermission,
    fastMode: defaults.fastMode ?? settings.defaultFastMode,
  };
}
