import "@/features/git/ui/changes/ChangedFiles.css";
import { Minus, Plus, Undo2 } from "lucide-react";
import type { GitFileChange } from "@shared/git/types";
import { baseName } from "@/foundation/ui/lib/format";
import { confirm } from "@/foundation/ui/kit/ask";
import { Chevron } from "@/foundation/ui/kit/Chevron";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import type { FileRename, TreeMulti } from "@/features/files/ui";
import { ChangedFiles, toggleFolder } from "./changes/ChangedFiles";

export type GitAction = "stage" | "unstage" | "discard";

/** まとまりの開閉（open）と、木の表示で閉じたフォルダ（closed。初めは全部開いておく）。見出しの「すべて開く / すべて閉じる」のため、親（ChangesPane）が持つ */
export interface ChangeFold {
  open: boolean;
  closed: ReadonlySet<string>;
}

export const OPEN_FOLD: ChangeFold = { open: true, closed: new Set() };

interface Props {
  title: string;
  files: GitFileChange[];
  /** ステージされている変更のまとまりか */
  staged: boolean;
  /** フォルダの階層をたどった木で出す（VS Code の「ツリーで表示」） */
  tree: boolean;
  selected?: { path: string; staged?: boolean };
  /** ファイルを押した（ふだんは表示中のタブの中身を入れ替える。新しいタブは右クリックの「新しいタブで開く」） */
  onSelect: (selection: { path: string; staged: boolean }, newTab?: boolean) => void;
  /** ⌘ / Shift ＋クリックの複数選択（まとまりをまたいで 1 つ。useChangeSelection） */
  multi: TreeMulti;
  /** このまとまりで選んでいるファイル（選んだ行のボタンは、選んでいるものすべてに効く） */
  picked: string[];
  /** ステージ・ステージの取り消し・元に戻す */
  onAction: (action: GitAction, paths: string[]) => void;
  /** ファイルの名前の変更（行にピントがあるときの Enter・右クリック。消したファイルは変えない） */
  rename?: FileRename;
  fold: ChangeFold;
  onFoldChange: (next: ChangeFold) => void;
}

/** 元に戻す前に確かめる（取り消せないので） */
export async function confirmDiscard(paths: string[]): Promise<boolean> {
  const name = baseName(paths[0]);
  return confirm({
    title: paths.length === 1 ? `「${name}」の変更を元に戻しますか？` : `${paths.length} 個のファイルの変更を元に戻しますか？`,
    message: "この操作は取り消せません。まだ Git に追加していない新しいファイルは消えます。",
    confirmLabel: "元に戻す",
    danger: true,
  }).then((r) => r !== null);
}

/**
 * 「ステージされている変更」「変更」のまとまり（見出しで開閉。数をバッジで出す）。
 * VS Code と同じく、マウスを乗せると操作のボタンを出す（変更: 元に戻す・ステージ / ステージ済み: ステージを取り消す）。⌘ / Shift ＋クリックで選んだ行のボタンは、
 * このまとまりで選んでいるものすべてに効く（VS Code と同じ）
 */
export function ChangeGroup({ title, files, staged, tree, selected, onSelect, multi, picked, onAction, rename, fold, onFoldChange }: Props) {
  const { open, closed } = fold;

  const run = async (action: GitAction, paths: string[]) => {
    if (paths.length === 0) return;
    if (action === "discard" && !(await confirmDiscard(paths))) return;
    onAction(action, paths);
  };
  // 行・フォルダ・まとまりの操作（paths はその中のファイル）
  const buttons = (paths: string[], scope: string) =>
    staged ? (
      <IconButton icon={Minus} label={`${scope}のステージを取り消す`} iconSize={14} onClick={() => void run("unstage", paths)} />
    ) : (
      <>
        <IconButton icon={Undo2} label={`${scope}の変更を元に戻す`} iconSize={14} onClick={() => void run("discard", paths)} />
        <IconButton icon={Plus} label={`${scope}をステージする`} iconSize={14} onClick={() => void run("stage", paths)} />
      </>
    );
  const pathsUnder = (dir: string) => files.filter((f) => f.path.startsWith(dir + "/")).map((f) => f.path);
  // 選んだいくつかの行の 1 つなら、選んでいるものすべてのボタンにする
  const rowButtons = (path: string, name: string) => (picked.length > 1 && picked.includes(path) ? buttons(picked, `選んだ ${picked.length} 件`) : buttons([path], `「${name}」`));
  // 右クリックのメニューに、どちらのまとまりの行かを添える（「新しいタブで開く」でそのまとまりの差分を開く）
  const groupRename: FileRename | undefined = rename && { ...rename, openMenu: (e, path, row, many) => rename.openMenu(e, path, { ...row, staged }, many) };

  return (
    <section className="change-group">
      <div className="change-group-row">
        <button className="change-group-head" aria-expanded={open} onClick={() => onFoldChange({ ...fold, open: !open })}>
          <Chevron open={open} />
          <span className="change-group-title">{title}</span>
        </button>
        <span className="row-actions">{buttons(files.map((f) => f.path), "すべて")}</span>
        <span className="change-count" aria-label={`${files.length} 件`}>
          {files.length}
        </span>
      </div>
      {/* 中身がなければ一覧を置かない（空の一覧の余白で、開閉のたびに高さが変わらないように） */}
      {open && files.length > 0 && (
        <ChangedFiles
          files={files}
          tree={tree}
          selected={selected?.staged === staged ? selected.path : undefined}
          onSelect={(path, newTab) => onSelect({ path, staged }, newTab)}
          multi={multi}
          actions={(node) => (node.dir ? buttons(pathsUnder(node.path), `「${node.name}」の中`) : rowButtons(node.path, node.name))}
          rename={groupRename}
          closed={closed}
          onToggleFolder={(path) => onFoldChange({ ...fold, closed: toggleFolder(closed, path) })}
        />
      )}
    </section>
  );
}
