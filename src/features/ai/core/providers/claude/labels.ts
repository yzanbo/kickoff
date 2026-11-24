// Claude Code のコマンド・理由・失敗の文言（provider.ts から分けた定数だけのモジュール）

/** ターミナルの画面でしか意味のないコマンド（Kickoff の画面には同じ働きのものがあるか、使えない）。チャット欄の / には出さない */
export const TERMINAL_ONLY_COMMANDS = new Set([
  "exit",
  "quit",
  "vim",
  "theme",
  "terminal-setup",
  "statusline",
  "ide",
  "login",
  "logout",
  "upgrade",
  "doctor",
  "resume",
  "config",
  "help",
  "bug",
  "feedback",
  "model",
  "permissions",
  "hooks",
  "agents",
  "mcp",
  "memory",
  "status",
  "privacy-settings",
  "release-notes",
  "keybindings",
  "rewind",
  "export",
  // 見た目・調査用（ターミナルだけ）
  "color",
  "heapdump",
  // Kickoff の画面に同じものがある（推論の深さ・ファストモード・名前の変更）
  "effort",
  "fast",
  "rename",
]);

/** ファストモードが使われなかった理由（SDK の fast_mode_disabled_reason）の文 */
export const FAST_MODE_REASONS: Record<string, string> = {
  extra_usage_disabled: "追加の使用枠（extra usage）が無効です",
  model_not_allowed: "このモデルはファストモードに対応していません",
  free: "現在のプランでは使えません",
  preference: "設定で無効になっています",
  not_first_party: "このプロバイダーでは使えません",
  disabled_by_env: "環境変数で無効になっています",
  network_error: "状態を確認できませんでした",
};

/** 結果の subtype（失敗の種類）の文 */
export const ERROR_LABELS: Record<string, string> = {
  error_max_turns: "最大ターン数に達しました",
  error_max_budget_usd: "予算上限に達しました",
  error_during_execution: "実行中にエラーが発生しました",
};
