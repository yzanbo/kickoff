import { CopyButton } from "./CopyButton";

/** ターミナルで流してもらうコマンドの 1 行と、そのコピーのボタン（音声入力の準備・Tailscale Serve・AI の CLI の版を上げる） */
export function CommandLine({ command }: { command: string }) {
  return (
    <div className="command-line">
      <code>{command}</code>
      <CopyButton text={command} label="コマンドをコピー" />
    </div>
  );
}
