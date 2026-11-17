import { ASSIGNMENT, shellScriptOf, splitCommands } from "../../chat/guard/shellWords.js";

/**
 * Codex が砂場の外でコマンドを流したいと頼んできたとき（approvalPolicy が on-request の承認の頼み）の決まり（メモの仕様書「0028」の F1）。
 * Claude Code の砂場と同じく、外で流すのは決まったコマンド（Kickoff の Bash の砂場の unsandboxedCommands: brew install・Electron を起動するスクリプトなど）だけ。
 * コマンド全体がそのどれかのときだけ通し、前の VAR=値・パイプ・リダイレクト・&& などが付けば通さない（Claude Code の excludedCommands と同じ見方）
 */

/** 外で流すのを断ったときに AI に伝える文 */
export const SANDBOX_EXIT_DECLINED =
  "Kickoff の砂場の外ではコマンドを流せません（外で流すのは決まったコマンドだけです）。書ける場所（作業フォルダ・メモフォルダ・一時フォルダなど）の外のファイルを変えるときは、ファイルの編集（apply_patch）を使ってください（Kickoff が利用者に確かめます）。利用者の設定を変えるコマンドは流さずに、利用者に示して自分のターミナルで流してもらってください";

/** シェルの記号（区切り・リダイレクト・置き換え）が入っているか */
const SHELL_SYNTAX = /[;&|<>`\n]|\$\(/;

/**
 * コマンド（Codex が渡す形。/bin/zsh -lc '…' で包まれていれば中を見る）が、外で流すコマンドの決まり（"brew install:*" = その語で始まる / ":*" なし = そのまま）の
 * どれかに丸ごと当たるか
 */
export function isUnsandboxedCommand(command: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false;
  const outer = splitCommands(command);
  if (outer.length !== 1) return false;
  const inner = shellScriptOf(outer[0]) ?? command;
  if (SHELL_SYNTAX.test(inner)) return false;
  const segments = splitCommands(inner);
  if (segments.length !== 1) return false;
  const words = segments[0];
  if (words.some((w) => w.dynamic) || ASSIGNMENT.test(words[0]?.text ?? "")) return false;
  const text = words.map((w) => w.text).join(" ");
  return patterns.some((p) => {
    if (!p.endsWith(":*")) return text === p;
    const prefix = p.slice(0, -2);
    return text === prefix || text.startsWith(`${prefix} `);
  });
}
