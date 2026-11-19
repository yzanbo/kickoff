// PR の「変更」の左のファイルの木（変更タブ・履歴の詳細と同じ FileTree と印。押すとそのファイルの差分へ移る）
import { useMemo, useState } from "react";
import type { GitHubPullFile } from "@shared/types";
import { useDragSize } from "@/foundation/ui/hooks/useDragSize";
import { GITHUB_FILES_WIDTH } from "@/foundation/ui/storage/storageKeys";
import { FileTree } from "@/features/files/ui/FileTree";
import { buildTree, folderPaths, kindMaps } from "@/foundation/ui/kit/list/treeModel";
import { pullFileChanges } from "./pullFiles";

/** 左のファイルの木（初めはすべてのフォルダを開く。幅は境目をドラッグで変える） */
export function GitHubPullFileTree({ files, selected, onSelect }: { files: GitHubPullFile[]; selected: string | null; onSelect: (path: string) => void }) {
  const changes = useMemo(() => pullFileChanges(files), [files]);
  const nodes = useMemo(() => buildTree({ files: changes.map((c) => c.path), ignored: [] }), [changes]);
  const kinds = useMemo(() => kindMaps(changes), [changes]);
  // 閉じたフォルダ（初めは全部開いておく）
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const open = useMemo(() => new Set(folderPaths(nodes).filter((p) => !closed.has(p))), [nodes, closed]);
  const { paneRef: widthPaneRef, ...width } = useDragSize({ setting: GITHUB_FILES_WIDTH, min: 160, keep: 360 });

  return (
    <>
      <aside ref={widthPaneRef} className="github-files-tree" style={{ width: width.size }} aria-label="変更したファイル">
        <FileTree
          nodes={nodes}
          open={open}
          onToggle={(path) =>
            setClosed((prev) => {
              const next = new Set(prev);
              if (!next.delete(path)) next.add(path);
              return next;
            })
          }
          selected={selected ?? undefined}
          onSelect={onSelect}
          kinds={kinds}
        />
      </aside>
      <div className="pane-resizer" aria-label="ファイルの木の幅を変える" {...width.handle} />
    </>
  );
}
