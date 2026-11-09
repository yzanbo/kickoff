import type { CSSProperties, ReactNode } from "react";
import type { GitChangeKind } from "@shared/types";
import { cx } from "@/lib/cx";
import { isRenameKey } from "@/lib/keys";
import { Chevron } from "@/ui/Chevron";
import { InlineName } from "@/ui/InlineName";
import { CHANGE_LABELS } from "./DiffView";
import { FileIcon } from "./FileIcon";
import { newEntryNameError, type TreeNode } from "./treeModel";
import type { FileCreate, FileRename } from "./useFileActions";

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
  /** 名前の変更（行にピントがあるときの Enter・右クリック。canRename が false の行は変えない） */
  rename?: FileRename;
  canRename?: (node: TreeNode) => boolean;
  /** 新しいファイル・フォルダの名前の欄（その中のいちばん上に出す。ファイルタブだけ） */
  create?: FileCreate;
  /** この段のフォルダのパス（いちばん外側は空） */
  parent?: string;
  depth?: number;
}

/** 同じフォルダに同じ名前があるか（名前の欄で書くたびに確かめる） */
export const siblingNameError = (siblings: readonly { name: string; path: string }[], self: string) => (name: string) =>
  /[/\\]/.test(name) ? "「/」は名前に使えません" : siblings.some((n) => n.path !== self && n.name === name) ? `「${name}」はもうあります` : null;

/** エクスプローラーのフォルダの木（開いているフォルダの中だけ描く） */
export function FileTree({ nodes, open, onToggle, selected, onSelect, kinds, actions, rename, canRename, create, parent = "", depth = 0 }: Props) {
  const creating = create?.creating;
  return (
    // 入れ子の段は、親のフォルダの開閉の矢印の下に縦の線（.file-tree[role="group"]::before。--guide-depth は親のフォルダの段）
    <ul className="file-tree" role={depth === 0 ? "tree" : "group"} style={depth > 0 ? ({ "--guide-depth": depth - 1 } as CSSProperties) : undefined}>
      {creating && creating.parent === parent && (
        // 新しいファイル・フォルダの名前の欄（Enter・ピントを外すと作り、Esc でやめる。空なら作らない）
        <li role="treeitem" className="tree-item">
          <div className="tree-row renaming" style={{ "--depth": depth } as CSSProperties}>
            <span className="tree-chevron" />
            <FileIcon name="" dir={creating.dir} open={false} />
            <InlineName
              className="tree-rename"
              maxLength={255}
              placeholder={creating.dir ? "フォルダー名" : "ファイル名"}
              validate={(name) => newEntryNameError(nodes, name)}
              onSubmit={create.submit}
              onCancel={create.cancel}
            />
          </div>
        </li>
      )}
      {nodes.map((node) => {
        const isOpen = node.dir && open.has(node.path);
        const kind = node.dir ? kinds.folders.get(node.path) : kinds.files.get(node.path);
        // 無視しているフォルダは中を開かない（node_modules などを全部たどらないように）
        const expandable = node.dir && !node.ignored;
        const renamable = rename && (canRename?.(node) ?? true);
        return (
          <li
            key={node.path}
            role="treeitem"
            aria-expanded={expandable ? isOpen : undefined}
            aria-selected={selected === node.path}
            className="tree-item"
            // 中身のある開いたフォルダ（選んだ・ピントがあるとき、縦の線を濃くするのは親の段ではなくこの中身の段。VS Code と同じ）
            data-open-group={(isOpen && node.children.length > 0) || undefined}
          >
            {rename?.renaming === node.path ? (
              // 名前を変えている行（Enter・ピントを外すと決め、Esc でやめる）
              <div className="tree-row renaming" style={{ "--depth": depth } as CSSProperties}>
                <span className="tree-chevron">{expandable && <Chevron open={isOpen} />}</span>
                <FileIcon name={node.name} dir={node.dir} open={isOpen} />
                <InlineName
                  className="tree-rename"
                  maxLength={255}
                  initial={node.name}
                  validate={siblingNameError(nodes, node.path)}
                  onSubmit={(name) => rename.submit(node.path, name)}
                  onCancel={rename.cancel}
                />
              </div>
            ) : (
              <button
                className={cx("tree-row", node.ignored && "ignored", selected === node.path && "selected")}
                style={{ "--depth": depth } as CSSProperties}
                data-kind={kind}
                title={kind ? `${node.path}（${CHANGE_LABELS[kind]}）` : node.path}
                onClick={() => (node.dir ? expandable && onToggle(node.path) : onSelect(node.path))}
                // 行にピントがあるときの Enter で名前を変える（Finder・メモの木と同じ。開くのは押す・Space）
                onKeyDown={(e) => {
                  if (!renamable || !isRenameKey(e)) return;
                  e.preventDefault();
                  rename.start(node.path);
                }}
                onContextMenu={
                  renamable
                    ? (e) => {
                        e.preventDefault();
                        rename.openMenu(e, node.path, node);
                      }
                    : undefined
                }
              >
                <span className="tree-chevron">{expandable && <Chevron open={isOpen} />}</span>
                <FileIcon name={node.name} dir={node.dir} open={isOpen} />
                <span className="tree-name">{node.name}</span>
                {/* ファイルは記号、フォルダは点（中に変更がある） */}
                {kind && <span className="tree-kind">{node.dir ? "•" : kind}</span>}
              </button>
            )}
            {actions && <span className="row-actions">{actions(node)}</span>}
            {isOpen && (node.children.length > 0 || creating?.parent === node.path) && (
              <FileTree
                nodes={node.children}
                open={open}
                onToggle={onToggle}
                selected={selected}
                onSelect={onSelect}
                kinds={kinds}
                actions={actions}
                rename={rename}
                canRename={canRename}
                create={create}
                parent={node.path}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
