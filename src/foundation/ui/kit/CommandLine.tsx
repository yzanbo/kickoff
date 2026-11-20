import { CopyButton } from "./CopyButton";

/** ターミナルで流してもらうコマンドの 1 行と、そのコピーのボタン（設定の手順の中に出す） */
export function CommandLine({ command }: { command: string }) {
  return (
    <div className="command-line">
      <code>{command}</code>
      <CopyButton text={command} label="コマンドをコピー" />
    </div>
  );
}
