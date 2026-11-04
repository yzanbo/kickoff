// アプリの外で開くときのアプリ（外部のターミナル・ブラウザ）。画面の設定の選択肢と、IPC の引数の範囲に使う

/** 外部のターミナルとして開けるアプリ（id は画面の設定に保存する。app は /Applications の中の名前。開き方はメインプロセスの app/openCommands.ts） */
export const EXTERNAL_TERMINALS = [
  { id: "terminal", label: "ターミナル（Terminal.app）", app: "Terminal" },
  { id: "ghostty", label: "Ghostty", app: "Ghostty" },
  { id: "iterm", label: "iTerm2", app: "iTerm" },
  { id: "warp", label: "Warp", app: "Warp" },
  { id: "wezterm", label: "WezTerm", app: "WezTerm" },
  { id: "alacritty", label: "Alacritty", app: "Alacritty" },
  { id: "kitty", label: "kitty", app: "kitty" },
] as const;
export type ExternalTerminalId = (typeof EXTERNAL_TERMINALS)[number]["id"];

/** 外部のブラウザとして開けるアプリ（id は画面の設定に保存する。app は /Applications の中の名前。開き方はメインプロセスの app/openCommands.ts。Safari はいつも入っている） */
export const EXTERNAL_BROWSERS = [
  { id: "chrome", label: "Google Chrome", app: "Google Chrome" },
  { id: "safari", label: "Safari", app: "Safari" },
  { id: "arc", label: "Arc", app: "Arc" },
  { id: "firefox", label: "Firefox", app: "Firefox" },
  { id: "edge", label: "Microsoft Edge", app: "Microsoft Edge" },
  { id: "brave", label: "Brave", app: "Brave Browser" },
  { id: "vivaldi", label: "Vivaldi", app: "Vivaldi" },
] as const;
export type ExternalBrowserId = (typeof EXTERNAL_BROWSERS)[number]["id"];
