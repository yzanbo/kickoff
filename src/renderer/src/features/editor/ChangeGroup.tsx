import { Minus, Plus, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { GitFileChange } from "@shared/types";
import { cx } from "@/lib/cx";
import { baseName } from "@/lib/format";
import { confirmDialog } from "@/ui/dialogs";
import { Chevron } from "@/ui/Chevron";
import { IconButton } from "@/ui/IconButton";
import { PathParts } from "@/ui/PathParts";
import { CHANGE_LABELS } from "./DiffView";
import { FileIcon } from "./FileIcon";
import { FileTree } from "./FileTree";
import { buildTree, folderPaths, kindMaps, type TreeNode } from "./treeModel";

export type GitAction = "stage" | "unstage" | "discard";

interface Props {
  title: string;
  files: GitFileChange[];
  /** ステージされている変更のまとまりか */
  staged: boolean;
  /** フォルダの階層をたどった木で出す（VS Code の「ツリーで表示」） */
  tree: boolean;
  selected?: { path: string; staged?: boolean };
  onSelect: (selection: { path: string; staged: boolean }) => void;
  /** ステージ・ステージの取り消し・元に戻す */
  onAction: (action: GitAction, paths: string[]) => void;
}

/** 元に戻す前に確かめる（取り消せないので） */
async function confirmDiscard(paths: string[]): Promise<boolean> {
  const name = baseName(paths[0]);
  return confirmDialog({
    title: paths.length === 1 ? `「${name}」の変更を元に戻しますか？` : `${paths.length} 個のファイルの変更を元に戻しますか？`,
    message: "この操作は取り消せません。まだ Git に追加していない新しいファイルは消えます。",
    confirmLabel: "元に戻す",
    danger: true,
  });
}

/**
 * 「ステージされている変更」「変更」のまとまり（見出しで開閉。数をバッジで出す）。
 * VS Code と同じく、マウスを乗せると操作のボタンを出す（変更: 元に戻す・ステージ / ステージ済み: ステージを取り消す）
 */
export function ChangeGroup({ title, files, staged, tree, selected, onSelect, onAction }: Props) {
  const [open, setOpen] = useState(true);
  // 木の表示で閉じたフォルダ（初めは全部開いておく）
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const nodes = useMemo(() => (tree ? buildTree({ files: files.map((f) => f.path), ignored: [] }) : []), [tree, files]);
  const kinds = useMemo(() => kindMaps(files), [files]);
  const openFolders = useMemo(() => new Set(folderPaths(nodes).filter((p) => !closed.has(p))), [nodes, closed]);

  const run = async (action: GitAction, paths: string[]) => {
    if (paths.length === 0) return;
    if (action === "discard" && !(await confirmDiscard(paths))) return;
    onAction(action, paths);
  };
  // 行・フォルダ・まとまりの操作（paths はその中のファイル）
  const buttons = (paths: string[], scope: string) =>
    staged ? (
      <IconButton icon={Minus} label={`${scope}のステージを取り消す`} size={14} onClick={() => void run("unstage", paths)} />
    ) : (
      <>
        <IconButton icon={Undo2} label={`${scope}の変更を元に戻す`} size={14} onClick={() => void run("discard", paths)} />
        <IconButton icon={Plus} label={`${scope}をステージする`} size={14} onClick={() => void run("stage", paths)} />
      </>
    );
  const pathsUnder = (node: TreeNode) => (node.dir ? files.filter((f) => f.path.startsWith(node.path + "/")).map((f) => f.path) : [node.path]);

  return (
    <section className="change-group">
      <div className="change-group-row">
        <button className="change-group-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Chevron open={open} />
          <span className="change-group-title">{title}</span>
        </button>
        <span className="row-actions">{buttons(files.map((f) => f.path), "すべて")}</span>
        <span className="change-count" aria-label={`${files.length} 件`}>
          {files.length}
        </span>
      </div>
      {open &&
        (tree ? (
          <FileTree
            nodes={nodes}
            open={openFolders}
            onToggle={(path) =>
              setClosed((prev) => {
                const next = new Set(prev);
                if (!next.delete(path)) next.add(path);
                return next;
              })
            }
            selected={selected?.staged === staged ? selected.path : undefined}
            onSelect={(path) => onSelect({ path, staged })}
            kinds={kinds}
            actions={(node) => buttons(pathsUnder(node), node.dir ? `「${node.name}」の中` : `「${node.name}」`)}
          />
        ) : (
          <ul className="change-files">
            {files.map((file) => {
              const name = baseName(file.path);
              const isSelected = selected?.staged === staged && selected.path === file.path;
              return (
                <li key={file.path} className="change-item">
                  <button
                    className={cx("change-file", isSelected && "selected")}
                    aria-current={isSelected || undefined}
                    title={`${file.path}（${CHANGE_LABELS[file.kind]}）`}
                    onClick={() => onSelect({ path: file.path, staged })}
                  >
                    <FileIcon name={name} />
                    <PathParts path={file.path} nameClass={cx("change-name", file.kind === "D" && "deleted")} dirClass="change-dir" />
                    <span className="change-kind" data-kind={file.kind} aria-label={CHANGE_LABELS[file.kind]}>
                      {file.kind}
                    </span>
                  </button>
                  <span className="row-actions">{buttons([file.path], `「${name}」`)}</span>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
}
