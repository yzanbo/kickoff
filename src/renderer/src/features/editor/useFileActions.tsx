import { Copy, ExternalLink, FilePlus, FolderOpen, FolderPlus, FolderSearch, Minus, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { api } from "@/api";
import { baseName } from "@/lib/format";
import { showToast } from "@/ui/toast";
import { showTrashedToast } from "@/features/trash/trashActions";
import { errorMessage } from "@shared/errors";
import type { Placement } from "@/lib/floating";
import { alertDialog, confirmDialog, reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { useGitTarget } from "@/features/worktree/worktreeContext";
import { confirmDiscard, type GitAction } from "./ChangeGroup";
import type { PickedEntry } from "./FileTree";
import { joinTreePath, parentPath, topLevelPaths } from "./treeModel";
import type { ChangesSelection } from "./useFileTabs";
import type { GitStatusController } from "./useGitStatus";

/** 右クリックした行（null は木の下の空いている所。staged は変更の一覧のどちらのまとまりか。many は選んだいくつかの行の 1 つを右クリックしたときの、選んでいるものすべて） */
type MenuTarget = { path: string; dir: boolean; ignored: boolean; staged?: boolean; many: PickedEntry[] | null } | null;

/** 行に渡す名前の変更（FileTree・変更の一覧の行。renaming の行は名前の欄にする） */
export interface FileRename {
  /** 名前を変えている行のパス */
  renaming: string | null;
  start: (path: string) => void;
  submit: (path: string, name: string) => void;
  cancel: () => void;
  /** 右クリックのメニュー（path が null なら木の下の空いている所。many は ⌘ / Shift ＋クリックで選んでいるものすべて = その組のメニューにする） */
  openMenu: (e: MouseEvent<HTMLElement>, path: string | null, row?: { dir?: boolean; ignored?: boolean; staged?: boolean }, many?: PickedEntry[] | null) => void;
}

/** 新しいファイル・フォルダの名前の欄（FileTree が parent の中のいちばん上に出す） */
export interface FileCreate {
  creating: { parent: string; dir: boolean } | null;
  /** parent の中に名前の欄を出す（右クリックのメニュー・見出しのボタン） */
  start: (parent: string, dir: boolean) => void;
  submit: (name: string) => void;
  cancel: () => void;
}

/**
 * ファイルタブ・変更タブのファイル・フォルダの操作（名前の変更・新しいファイル / フォルダー・ゴミ箱・Finder で表示・パスのコピー・フォルダー内を検索）と、
 * 行・木の下の空いている所の右クリックのメニュー（VS Code のエクスプローラーと同じ並び）。
 * - 名前の変更（利用者の依頼: 選んでいる行で Enter を押すと名前の変更にする。メモの木・チャットの行と同じ。右クリックの「名前を変更」でも）:
 *   同じフォルダの中で名前だけを変える（コアの POST /file/rename）。開いているファイル（とフォルダの中）で保存していない変更があれば、
 *   先に保存してもらう（名前を変えると編集中の中身と結びつかなくなるため）。変えたら、開いているファイルを新しいパスに付け替え（onMoved で開いたフォルダも）、Git の状態を取り直す。
 * - 新しいファイル・フォルダー（ファイルタブだけ。explorer。利用者の依頼: メモの一覧と同じく、木の下の空いている所の右クリックでも）:
 *   VS Code と同じく、名前を書いてから作る（その場所に名前の欄を出す。Esc ならやめて何も残さない。Git の作業場所に仮の名前のファイルを残さないため）。
 *   フォルダーの行ならその中、ファイルの行ならその入ったフォルダー、空いている所ならいちばん外側。「a/b.ts」と書けば途中のフォルダーも作る。
 *   作ったらファイルは開き、上のフォルダーを開く（onReveal）。
 * - ゴミ箱に入れる（ファイルタブだけ）: 確かめてから。開いていたファイルは閉じる（保存していない変更も捨てる。確かめの文で伝える）
 * - 新しいタブで開く（ファイルの行。前は ⌘クリックだったが、⌘ は複数選択に使うので右クリックへ移した）
 * - ⌘ / Shift ＋クリックで選んだ行の 1 つを右クリックしたら、選んでいるものすべてに効く組（新しいタブで開く・ステージ / ステージの取り消し / 元に戻す（変更の一覧）・
 *   パスのコピー（1 行に 1 つ）・ゴミ箱（1 回だけ確かめる。ファイルタブだけ））
 */
export function useFileActions(
  projectId: number,
  {
    root,
    explorer,
    selection,
    git,
    onMoved,
    onReveal,
    onFindInFolder,
    openTab,
    gitRun,
  }: {
    /** 作業場所のフォルダ（絶対パス。Finder で表示・パスをコピー） */
    root: string;
    /** ファイルタブ（エクスプローラー）の右クリックか（新しいファイル・ゴミ箱を出す） */
    explorer: boolean;
    selection: ChangesSelection;
    git: GitStatusController;
    onMoved?: (from: string, to: string) => void;
    /** そのフォルダーとその上を開く（名前の欄・作ったものを見せる） */
    onReveal?: (folder: string) => void;
    onFindInFolder?: (folder: string) => void;
    /** ファイルを新しいタブで開く（staged は変更の一覧から開くときのまとまり。差分を出す） */
    openTab: (path: string, staged?: boolean) => void;
    /** 変更の一覧で選んだもののステージ・ステージの取り消し・元に戻す */
    gitRun: (action: GitAction, paths: string[]) => void;
  },
) {
  const { target } = useGitTarget(projectId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState<FileCreate["creating"]>(null);
  const menu = useContextMenu<MenuTarget>();
  const native = window.kickoff?.externalApps;
  const absolute = (path: string) => (path ? `${root}/${path}` : root);

  const start = (path: string) => {
    const unsaved = selection.dirtyUnder(path);
    if (unsaved) {
      void alertDialog("保存していない変更があります", `「${baseName(unsaved)}」を保存してから、名前を変えてください。`);
      return;
    }
    setCreating(null);
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

  const startCreate = (parent: string, dir: boolean) => {
    setRenaming(null);
    if (parent) onReveal?.(parent);
    setCreating({ parent, dir });
  };
  const submitCreate = (name: string) => {
    if (!creating) return;
    const { parent, dir } = creating;
    setCreating(null);
    const path = joinTreePath(parent, name);
    void api
      .createProjectFile(target, path, dir)
      .then(async () => {
        const folder = dir ? path : parentPath(path);
        if (folder) onReveal?.(folder);
        await git.refresh();
        if (!dir) void selection.setSelected({ path, focus: true }, true);
      })
      .catch(reportFailure(dir ? "フォルダーを作れませんでした" : "ファイルを作れませんでした"));
  };

  const trash = async (path: string, dir: boolean) => {
    const unsaved = selection.dirtyUnder(path) !== null;
    const ok = await confirmDialog({
      title: dir ? `フォルダー「${baseName(path)}」をゴミ箱に入れますか？` : `「${baseName(path)}」をゴミ箱に入れますか？`,
      message: `${dir ? "中のファイルもすべてゴミ箱に入ります。" : ""}Kickoff のゴミ箱に 3 日入り、その間はプロジェクトの「ゴミ箱」から戻せます。${unsaved ? "開いているファイルの保存していない変更は消えます。" : ""}`,
      confirmLabel: "ゴミ箱に入れる",
      danger: true,
    });
    if (!ok) return;
    await api.trashProjectFile(target, path).then(({ trash_id }) => {
      selection.forget(path);
      void git.refresh();
      showTrashedToast(trash_id, baseName(path));
    }, reportFailure("ゴミ箱に入れられませんでした"));
  };

  /** 選んだいくつかをまとめてゴミ箱に入れる（確かめは 1 回。フォルダとその中を両方選んでいればフォルダだけ。失敗したものは最後にまとめて知らせる） */
  const trashMany = async (entries: readonly PickedEntry[]) => {
    const tops = new Set(topLevelPaths(entries.map((n) => n.path)));
    const targets = entries.filter((n) => tops.has(n.path));
    if (targets.length === 1) return trash(targets[0].path, targets[0].dir);
    const names = targets.slice(0, 10).map((n) => `・${baseName(n.path)}${n.dir ? "（フォルダー）" : ""}`);
    if (targets.length > names.length) names.push(`ほか ${targets.length - names.length} 件`);
    const unsaved = targets.some((n) => selection.dirtyUnder(n.path) !== null);
    const ok = await confirmDialog({
      title: `${targets.length} 件をゴミ箱に入れますか？`,
      message: `${names.join("\n")}\n\n${targets.some((n) => n.dir) ? "フォルダーの中のファイルもすべてゴミ箱に入ります。" : ""}Kickoff のゴミ箱に 3 日入り、その間はプロジェクトの「ゴミ箱」から戻せます。${unsaved ? "開いているファイルの保存していない変更は消えます。" : ""}`,
      confirmLabel: "ゴミ箱に入れる",
      danger: true,
    });
    if (!ok) return;
    const failed: string[] = [];
    for (const { path } of targets) {
      try {
        await api.trashProjectFile(target, path);
        selection.forget(path);
      } catch (e) {
        failed.push(`${baseName(path)}: ${errorMessage(e)}`);
      }
    }
    void git.refresh();
    if (failed.length < targets.length) showToast(`${targets.length - failed.length} 件をゴミ箱に入れました（3 日はプロジェクトの「ゴミ箱」から戻せます）`);
    if (failed.length > 0) await alertDialog("ゴミ箱に入れられなかったものがあります", failed.join("\n"));
  };

  /** 変更の一覧で選んだもののステージ・取り消し・元に戻す（元に戻すは確かめてから） */
  const runGitMany = async (action: GitAction, paths: string[]) => {
    if (action === "discard" && !(await confirmDiscard(paths))) return;
    gitRun(action, paths);
  };

  const rename: FileRename = {
    renaming,
    start,
    submit,
    cancel: () => setRenaming(null),
    openMenu: (e, path, row, many) =>
      menu.open(e, path === null ? null : { path, dir: row?.dir ?? false, ignored: row?.ignored ?? false, staged: row?.staged, many: many ?? null }),
  };
  const create: FileCreate = { creating, start: startCreate, submit: submitCreate, cancel: () => setCreating(null) };

  const value = menu.menu?.value ?? null;
  const many = value?.many ?? null;
  // 新しく作る場所（フォルダーの行ならその中、ファイルの行ならその入ったフォルダー、空いている所ならいちばん外側）。無視しているフォルダーの中には作らない（開けないため）
  const folder = value === null ? "" : value.dir ? value.path : parentPath(value.path);
  const canCreate = explorer && !(value?.dir && value.ignored);
  const menuElement = menu.menu && many ? (
    <ManyMenu at={menu.menu.at} many={many} explorer={explorer} absolute={absolute} onClose={menu.close} openTab={openTab} onGit={(a, paths) => void runGitMany(a, paths)} onTrash={(entries) => void trashMany(entries)} />
  ) : (
    menu.menu && (
    <PopupMenu at={menu.menu.at} label={value ? `「${baseName(value.path)}」` : "ファイルの操作"} onClose={menu.close}>
      {canCreate && (
        <>
          <MenuItem onSelect={() => startCreate(folder, false)}>
            <FilePlus size={14} aria-hidden /> 新しいファイル…
          </MenuItem>
          <MenuItem onSelect={() => startCreate(folder, true)}>
            <FolderPlus size={14} aria-hidden /> 新しいフォルダー…
          </MenuItem>
          <div className="menu-separator" role="separator" />
        </>
      )}
      {value && !value.dir && (
        <>
          <MenuItem onSelect={() => openTab(value.path, value.staged)}>
            <ExternalLink size={14} aria-hidden /> 新しいタブで開く
          </MenuItem>
          <div className="menu-separator" role="separator" />
        </>
      )}
      {native && (
        <MenuItem onSelect={() => void native.revealPath(absolute(value?.path ?? ""))}>
          <FolderOpen size={14} aria-hidden /> Finder で表示
        </MenuItem>
      )}
      {value?.dir && onFindInFolder && (
        <MenuItem title="検索タブで、このフォルダーの中だけを探す" onSelect={() => onFindInFolder(value.path)}>
          <FolderSearch size={14} aria-hidden /> フォルダー内を検索
        </MenuItem>
      )}
      {(native || value?.dir) && <div className="menu-separator" role="separator" />}
      <MenuItem title="フルパスをコピーします" onSelect={() => void navigator.clipboard.writeText(absolute(value?.path ?? ""))}>
        <Copy size={14} aria-hidden /> パスをコピー
      </MenuItem>
      {value && (
        <MenuItem title="作業場所のフォルダーから見たパスをコピーします" onSelect={() => void navigator.clipboard.writeText(value.path)}>
          <Copy size={14} aria-hidden /> 相対パスをコピー
        </MenuItem>
      )}
      {value && (
        <>
          <div className="menu-separator" role="separator" />
          <MenuItem title="Enter でも変えられます" onSelect={() => start(value.path)}>
            <Pencil size={14} aria-hidden /> 名前を変更
          </MenuItem>
          {explorer && (
            <MenuItem danger onSelect={() => void trash(value.path, value.dir)}>
              <Trash2 size={14} aria-hidden /> ゴミ箱に入れる…
            </MenuItem>
          )}
        </>
      )}
    </PopupMenu>
    )
  );
  return { rename, create, menuElement };
}

/** 選んだいくつかの行の右クリックのメニュー（ファイルタブの木・変更の一覧） */
function ManyMenu({
  at,
  many,
  explorer,
  absolute,
  onClose,
  openTab,
  onGit,
  onTrash,
}: {
  at: Placement;
  many: PickedEntry[];
  explorer: boolean;
  absolute: (path: string) => string;
  onClose: () => void;
  openTab: (path: string, staged?: boolean) => void;
  onGit: (action: GitAction, paths: string[]) => void;
  onTrash: (entries: PickedEntry[]) => void;
}) {
  const files = many.filter((n) => !n.dir);
  // 変更の一覧のまとまりごと（ファイルタブでは staged を持たないので、どちらも空）
  const unstaged = many.filter((n) => n.staged === false).map((n) => n.path);
  const staged = many.filter((n) => n.staged === true).map((n) => n.path);
  const copy = (text: string) => void navigator.clipboard.writeText(text);
  return (
    <PopupMenu at={at} label={`選んだ ${many.length} 件の操作`} onClose={onClose}>
      {files.length > 0 && (
        <MenuItem
          onSelect={() => {
            for (const f of files) openTab(f.path, f.staged);
          }}
        >
          <ExternalLink size={14} aria-hidden /> 新しいタブで開く（{files.length} 件）
        </MenuItem>
      )}
      {(unstaged.length > 0 || staged.length > 0) && <div className="menu-separator" role="separator" />}
      {unstaged.length > 0 && (
        <MenuItem onSelect={() => onGit("stage", unstaged)}>
          <Plus size={14} aria-hidden /> ステージする（{unstaged.length} 件）
        </MenuItem>
      )}
      {staged.length > 0 && (
        <MenuItem onSelect={() => onGit("unstage", staged)}>
          <Minus size={14} aria-hidden /> ステージを取り消す（{staged.length} 件）
        </MenuItem>
      )}
      {unstaged.length > 0 && (
        <MenuItem danger onSelect={() => onGit("discard", unstaged)}>
          <Undo2 size={14} aria-hidden /> 変更を元に戻す…（{unstaged.length} 件）
        </MenuItem>
      )}
      <div className="menu-separator" role="separator" />
      <MenuItem title="フルパスを 1 行に 1 つずつコピーします" onSelect={() => copy(many.map((n) => absolute(n.path)).join("\n"))}>
        <Copy size={14} aria-hidden /> パスをコピー（{many.length} 件）
      </MenuItem>
      <MenuItem title="作業場所のフォルダーから見たパスを 1 行に 1 つずつコピーします" onSelect={() => copy(many.map((n) => n.path).join("\n"))}>
        <Copy size={14} aria-hidden /> 相対パスをコピー（{many.length} 件）
      </MenuItem>
      {explorer && (
        <>
          <div className="menu-separator" role="separator" />
          <MenuItem danger onSelect={() => onTrash(many)}>
            <Trash2 size={14} aria-hidden /> ゴミ箱に入れる…（{many.length} 件）
          </MenuItem>
        </>
      )}
    </PopupMenu>
  );
}
