import { FolderSearch, Pencil } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { api } from "@/api";
import { baseName } from "@/lib/format";
import { alertDialog, reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { useGitTarget } from "@/features/worktree/worktreeContext";
import type { ChangesSelection } from "./useChangesSelection";
import type { GitStatusController } from "./useGitStatus";

/** 行に渡す名前の変更（FileTree・変更の一覧の行。renaming の行は名前の欄にする） */
export interface FileRename {
  /** 名前を変えている行のパス */
  renaming: string | null;
  start: (path: string) => void;
  submit: (path: string, name: string) => void;
  cancel: () => void;
  /** 右クリックのメニュー（名前を変更。フォルダーなら「フォルダー内を検索」も） */
  openMenu: (e: MouseEvent<HTMLElement>, path: string, dir?: boolean) => void;
}

/** そのパスか、そのフォルダの中か */
const isUnder = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);

/**
 * ファイルタブ・変更タブのファイル・フォルダの名前の変更（利用者の依頼: 選んでいる行で Enter を押すと名前の変更にする。メモの木・チャットの行と同じ。
 * 右クリックの「名前を変更」でも）。同じフォルダの中で名前だけを変える（コアの POST /file/rename）。
 * 開いているファイル（とフォルダの中）で保存していない変更があれば、先に保存してもらう（名前を変えると編集中の中身と結びつかなくなるため）。
 * 変えたら、開いているファイルを新しいパスに付け替え（onMoved で開いたフォルダも）、Git の状態を取り直す。
 * 右クリックのメニューには、フォルダーなら「フォルダー内を検索」（VS Code と同じ。onFindInFolder）も出す
 */
export function useFileRename(
  projectId: number,
  { selection, git, onMoved, onFindInFolder }: { selection: ChangesSelection; git: GitStatusController; onMoved?: (from: string, to: string) => void; onFindInFolder?: (folder: string) => void },
) {
  const { target } = useGitTarget(projectId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const menu = useContextMenu<{ path: string; dir: boolean }>();

  const start = (path: string) => {
    const open = selection.selected?.path;
    if (open && isUnder(open, path) && selection.isDirty()) {
      void alertDialog("保存していない変更があります", `「${baseName(open)}」を保存してから、名前を変えてください。`);
      return;
    }
    setRenaming(path);
  };
  const submit = (path: string, name: string) => {
    setRenaming(null);
    if (name === baseName(path)) return;
    void api
      .renameProjectFile(target, path, name)
      .then(({ path: to }) => {
        selection.relocate(path, to);
        onMoved?.(path, to);
        void git.refresh();
      })
      .catch(reportFailure("名前を変えられませんでした"));
  };

  const rename: FileRename = { renaming, start, submit, cancel: () => setRenaming(null), openMenu: (e, path, dir = false) => menu.open(e, { path, dir }) };
  const menuElement = menu.menu && (
    <PopupMenu at={menu.menu.at} label={`「${baseName(menu.menu.value.path)}」`} onClose={menu.close}>
      <MenuItem title="Enter でも変えられます" onSelect={() => menu.menu && start(menu.menu.value.path)}>
        <Pencil size={14} aria-hidden /> 名前を変更
      </MenuItem>
      {menu.menu.value.dir && onFindInFolder && (
        <MenuItem title="検索タブで、このフォルダーの中だけを探す" onSelect={() => menu.menu && onFindInFolder(menu.menu.value.path)}>
          <FolderSearch size={14} aria-hidden /> フォルダー内を検索
        </MenuItem>
      )}
    </PopupMenu>
  );
  return { rename, menuElement };
}
