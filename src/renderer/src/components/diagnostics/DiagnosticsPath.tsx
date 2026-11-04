import { FolderOpen } from "lucide-react";
import { CopyButton } from "../CopyButton";
import { IconButton } from "../IconButton";

/** 性能の記録の保存先の 1 行（場所・コピー・Finder で開く）。記録を保存したときの印と、設定の「診断」で共通 */
export function DiagnosticsPath({ dir, onOpen }: { dir: string; onOpen?: () => void }) {
  return (
    <span className="diagnostics-path">
      <code title={dir}>{dir}</code>
      <CopyButton label="保存先をコピー" text={dir} />
      <IconButton icon={FolderOpen} size={13} label="Finder で開く" onClick={onOpen ?? (() => void window.kickoff?.openPath(dir))} />
    </span>
  );
}
