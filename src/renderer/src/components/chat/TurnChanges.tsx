import { ChevronRight } from "lucide-react";
import { useContext } from "react";
import { FileIcon } from "../changes/FileIcon";
import { FileLinkContext } from "../fileLinks/fileLinkContext";
import type { FileChange } from "./turnFileChanges";

/** 足した行・消した行（＋12 −3）。書き直しは消した行が分からないので足した行だけ */
function Counts({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="turn-change-counts">
      {added > 0 && <span className="turn-change-add">+{added}</span>}
      {removed > 0 && <span className="turn-change-del">−{removed}</span>}
    </span>
  );
}

/**
 * ターンの変更カード: その作業で変えたファイルの数と、足した・消した行の合計。開くとファイルの一覧で、
 * 押すとエディタタブでそのファイル（変わっていれば差分）を開く。作業場所の外のファイル・一覧が読めないときは、押せない行にする
 */
export function TurnChanges({ files }: { files: FileChange[] }) {
  const links = useContext(FileLinkContext);
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  const root = links ? `${links.index.root}/` : undefined;
  return (
    <details className="turn-changes">
      <summary>
        <ChevronRight size={13} className="tool-chevron" />
        <span>{files.length} 個のファイルを変更</span>
        <Counts added={added} removed={removed} />
      </summary>
      <ul>
        {files.map((f) => {
          const rel = root && f.path.startsWith(root) ? f.path.slice(root.length) : undefined;
          const name = f.path.slice(f.path.lastIndexOf("/") + 1);
          const dir = (rel ?? f.path).slice(0, -name.length).replace(/\/$/, "");
          const body = (
            <>
              <FileIcon name={name} />
              <span className="turn-change-name">{name}</span>
              {dir && <span className="turn-change-dir">{dir}</span>}
              {f.write && <span className="turn-change-tag">{f.write === "created" ? "新規" : "書き直し"}</span>}
              <Counts added={f.added} removed={f.removed} />
            </>
          );
          return (
            <li key={f.path}>
              {links && rel ? (
                <button type="button" className="turn-change-file" title={`${rel} をエディタタブで開く（変わっていれば差分）`} onClick={() => links.open({ path: rel })}>
                  {body}
                </button>
              ) : (
                <span className="turn-change-file" title={f.path}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
