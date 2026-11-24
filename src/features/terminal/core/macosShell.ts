import type { TerminalShell } from "./shell";

/** macOS の内蔵ターミナルのシェル: ログインシェル（$SHELL。なければ zsh）。決まったコマンドのタブは -l -c でそれだけを流す */
export const macosTerminalShell = (): TerminalShell => ({ file: process.env.SHELL || "/bin/zsh", args: (command) => (command ? ["-l", "-c", command] : ["-l"]) });
