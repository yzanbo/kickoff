import type { CSSProperties, ReactNode } from "react";
import type { GitChangeKind } from "@shared/types";
import { cx } from "@/lib/cx";
import { Chevron } from "@/ui/Chevron";
import { CHANGE_LABELS } from "./DiffView";
import { FileIcon } from "./FileIcon";
import type { TreeNode } from "./treeModel";

interface Props {
  nodes: TreeNode[];
  /** 開いているフォルダ */
  open: Set<string>;
  onToggle: (path: string) => void;
  selected?: string;
  onSelect: (path: string) => void;
  /** 変更の記号（ファイルとフォルダ。VS Code と同じく、変更のあるものだけ色を変える） */
  kinds: { files: Map<string, GitChangeKind>; folders: Map<string, GitChangeKind> };
  /** 行の右に出す操作（ステージ・元に戻すなど。マウスを乗せたときに出す） */
  actions?: (node: TreeNode) => ReactNode;
  depth?: number;
}

/** エクスプローラーのフォルダの木（開いているフォルダの中だけ描く） */
export function FileTree({ nodes, open, onToggle, selected, onSelect, kinds, actions, depth = 0 }: Props) {
  return (
    <ul className="file-tree" role={depth === 0 ? "tree" : "group"}>
      {nodes.map((node) => {
        const isOpen = node.dir && open.has(node.path);
        const kind = node.dir ? kinds.folders.get(node.path) : kinds.files.get(node.path);
        // 無視しているフォルダは中を開かない（node_modules などを全部たどらないように）
        const expandable = node.dir && !node.ignored;
        return (
          <li key={node.path} role="treeitem" aria-expanded={expandable ? isOpen : undefined} aria-selected={selected === node.path} className="tree-item">
            <button
              className={cx("tree-row", node.ignored && "ignored", selected === node.path && "selected")}
              style={{ "--depth": depth } as CSSProperties}
              data-kind={kind}
              title={kind ? `${node.path}（${CHANGE_LABELS[kind]}）` : node.path}
              onClick={() => (node.dir ? expandable && onToggle(node.path) : onSelect(node.path))}
            >
              <span className="tree-chevron">{expandable && <Chevron open={isOpen} />}</span>
              <FileIcon name={node.name} dir={node.dir} open={isOpen} />
              <span className="tree-name">{node.name}</span>
              {/* ファイルは記号、フォルダは点（中に変更がある） */}
              {kind && <span className="tree-kind">{node.dir ? "•" : kind}</span>}
            </button>
            {actions && <span className="row-actions">{actions(node)}</span>}
            {isOpen && node.children.length > 0 && (
              <FileTree nodes={node.children} open={open} onToggle={onToggle} selected={selected} onSelect={onSelect} kinds={kinds} actions={actions} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
