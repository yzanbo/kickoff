import { ChevronRight, FileDiff } from "lucide-react";
import { useContext } from "react";
import { baseName } from "@/lib/format";
import { PathParts } from "@/ui/PathParts";
import { FileIcon } from "@/features/editor/FileIcon";
import { FileLinkContext, openByClick } from "@/features/fileLinks/fileLinkContext";
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
 * 押すと右の欄でそのファイルを開く（コミットしていない変更があれば変更のタブのその位置、なければ中身。⌘クリックはエディタタブ・右クリックでほかの開き方）。
 * 見出しの「差分を見る」は、右の欄の変更のタブを、この作業で変えた最初のファイルの位置で開く。作業場所の外のファイル・一覧が読めないときは、押せない行にする
 */
export function TurnChanges({ files }: { files: FileChange[] }) {
  const links = useContext(FileLinkContext);
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  const root = links ? `${links.index.root}/` : undefined;
  const relOf = (path: string) => (root && path.startsWith(root) ? path.slice(root.length) : undefined);
  // 作業場所の中で変えた最初のファイル（見出しの「差分を見る」で、その位置へ移る）
  const first = files.map((f) => relOf(f.path)).find((p) => p !== undefined);
  return (
    <details className="turn-changes">
      <summary>
        <ChevronRight size={13} className="tool-chevron" />
        <span>{files.length} 個のファイルを変更</span>
        <Counts added={added} removed={removed} />
        {links && first && (
          <button
            type="button"
            className="link-button turn-changes-diff"
            title={links.side ? "この作業の変更を、右の欄の「変更」で見ます（変えた最初のファイルの位置へ）" : "変えた最初のファイルを、エディタタブで見ます"}
            onClick={(e) => {
              // 見出しの開閉はしない
              e.preventDefault();
              links.openChanges(first);
            }}
          >
            <FileDiff size={12} aria-hidden /> 差分を見る
          </button>
        )}
      </summary>
      <ul>
        {files.map((f) => {
          const rel = relOf(f.path);
          const body = (
            <>
              <FileIcon name={baseName(f.path)} />
              {/* フォルダは作業場所からの相対（作業場所の外なら絶対パスのまま） */}
              <PathParts path={rel ?? f.path} nameClass="turn-change-name" dirClass="turn-change-dir" />
              {f.write && <span className="turn-change-tag">{f.write === "created" ? "新規" : "書き直し"}</span>}
              <Counts added={f.added} removed={f.removed} />
            </>
          );
          return (
            <li key={f.path}>
              {links && rel ? (
                <button
                  type="button"
                  className="turn-change-file"
                  title={`${rel} を${links.side ? "右の欄" : "エディタタブ"}で開く（変わっていれば差分。⌘クリックでエディタタブ・右クリックでほかの開き方）`}
                  onClick={(e) => openByClick(links, e, { path: rel })}
                  onContextMenu={(e) => links.showMenu(e, { path: rel })}
                >
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
