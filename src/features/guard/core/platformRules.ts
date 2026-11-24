// 守りが OS ごとに受ける決まり（macOS の値は macosRules.ts・macosSandbox.ts。組み立て @/app/core/platform.ts が選んで渡す）

/** 自分を守る仕組み（guard/selfProtection.ts）が見分ける、OS ごとのプロセスを止める・操作するコマンド */
export interface SelfGuardRules {
  /** 名前でまとめて止めるコマンド（macOS は pkill・killall） */
  killByName: RegExp;
  /** アプリを外から操作する手段と、断るときの呼び名（macOS は osascript = AppleScript） */
  scripting: { pattern: RegExp; label: string };
}

/** AI の Bash の砂場に OS ごとに足す決まり */
export interface AgentSandboxRules {
  /** OS の一時フォルダ（実体のパス）。Bash の砂場に加えて、ファイルを書き換えるツール（Write・Edit）の書き込み先の守りでも聞かずに書かせる */
  tempDirs: string[];
  /** 書けるフォルダ（一時フォルダ・キャッシュ・パッケージの置き場など。まだないものを返してもよい） */
  writableDirs: () => Promise<string[]>;
  /**
   * 砂場の外で流すコマンド（Claude Code の許可ルールの書き方 `<コマンド>:*`。中で自分の砂場をかけるので、砂場の中では動かないもの。
   * macOS は砂場の入れ子を許さないので、brew install など）
   */
  unsandboxedCommands: string[];
}
