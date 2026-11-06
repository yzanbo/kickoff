import { Paperclip } from "lucide-react";
import type { CSSProperties } from "react";
import { IconButton } from "@/ui/IconButton";
import { Chevron } from "@/ui/Chevron";
import { FileIcon } from "@/features/editor/FileIcon";
import type { TreeNode } from "@/features/editor/treeModel";
import { OpenPlaceButtons, type OpenPlace } from "@/features/chat/composer/OpenPlaceControls";

interface Props {
  nodes: TreeNode[];
  /** 開いているフォルダ（メモのタブと同じ覚え方） */
  open: ReadonlySet<string>;
  onToggle: (path: string) => void;
  /** メモを開く（place を省けば設定の開き方） */
  onOpen: (path: string, place?: "side" | "window") => void;
  /** メモを開かずに、このチャットの入力欄に添付する */
  onAttach: (path: string) => void;
  /** 行の右の「右で開く」「新規ウィンドウで開く」 */
  places: readonly OpenPlace[];
  depth?: number;
}

/**
 * 入力欄の上の「メモ」の一覧の木（メモのタブと同じフォルダの並び。開いているフォルダの中だけ描く）。
 * フォルダの行は押すと開閉し、メモの行は押すと開く。メモの行の右に「このチャットに添付」と開く場所のボタン
 */
export function MemoChipTree({ nodes, open, onToggle, onOpen, onAttach, places, depth = 0 }: Props) {
  return (
    <ul className="memo-chip-tree" role={depth === 0 ? "tree" : "group"}>
      {nodes.map((node) => {
        const style = { "--depth": depth } as CSSProperties;
        if (node.dir) {
          const isOpen = open.has(node.path);
          return (
            <li key={node.path} role="treeitem" aria-expanded={isOpen}>
              <button type="button" className="memo-chip-row memo-chip-dir" style={style} title={node.path} onClick={() => onToggle(node.path)}>
                <Chevron open={isOpen} />
                <FileIcon name={node.name} dir open={isOpen} />
                <span className="memo-chip-title">{node.name}</span>
              </button>
              {isOpen && <MemoChipTree nodes={node.children} open={open} onToggle={onToggle} onOpen={onOpen} onAttach={onAttach} places={places} depth={depth + 1} />}
            </li>
          );
        }
        return (
          <li key={node.path} role="treeitem">
            <div role="button" tabIndex={0} className="memo-chip-row" style={style} title={node.path} onClick={() => onOpen(node.path)} onKeyDown={(k) => k.key === "Enter" && onOpen(node.path)}>
              {/* フォルダの行の開閉の矢印の分だけ空けて、名前の頭をそろえる */}
              <span className="memo-chip-indent" aria-hidden />
              <FileIcon name={node.name} />
              <span className="memo-chip-title">{node.name}</span>
              <IconButton
                type="button"
                icon={Paperclip}
                size={13}
                label="このチャットに添付"
                title="メモを開かずに、このチャットの入力欄に添付します"
                className="open-place-button memo-chip-attach"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onAttach(node.path);
                }}
              />
              <OpenPlaceButtons places={places} onOpen={(place) => onOpen(node.path, place === "window" ? "window" : "side")} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
