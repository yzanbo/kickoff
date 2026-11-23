// PR の「変更」の左のファイルの木（変更タブ・履歴の詳細と同じ ChangedFiles の木と印。押すとそのファイルの差分へ移る）
import "./GitHubPullFileTree.css";
import { useState } from "react";
import type { GitHubPullFile } from "@shared/github/types";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { storage } from "./storage";
import { ChangedFiles, toggleFolder } from "@/features/git/ui";
import { pullFileChanges } from "./pullFiles";

/** 左のファイルの木（初めはすべてのフォルダを開く。幅は境目をドラッグで変える） */
export function GitHubPullFileTree({ files, selected, onSelect }: { files: GitHubPullFile[]; selected: string | null; onSelect: (path: string) => void }) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const { paneRef: widthPaneRef, ...width } = useDragSize({ setting: storage.settings.filesWidth, min: 160, keep: 360 });

  return (
    <>
      <aside ref={widthPaneRef} className="github-files-tree" style={{ width: width.size }} aria-label="変更したファイル">
        <ChangedFiles files={pullFileChanges(files)} tree selected={selected ?? undefined} onSelect={(path) => onSelect(path)} closed={closed} onToggleFolder={(path) => setClosed((prev) => toggleFolder(prev, path))} />
      </aside>
      <div className="pane-resizer" aria-label="ファイルの木の幅を変える" {...width.handle} />
    </>
  );
}
