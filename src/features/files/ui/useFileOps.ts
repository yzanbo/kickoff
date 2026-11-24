import { TRASH_KEEP_DAYS } from "@shared/trash/types";
import { useState, type MouseEvent } from "react";
import { baseName } from "@/foundation/ui/lib/format";
import { showToast } from "@/foundation/ui/kit/toast";
import { showTrashedToast } from "@/features/trash/ui";
import { errorMessage } from "@shared/foundation/errors";
import { alert, confirm, reportFailure } from "@/foundation/ui/kit/ask";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import { useWorkplace } from "@/foundation/ui/workplace/workplaceContext";
import type { PickedEntry } from "./FileTree";
import { joinTreePath, parentPath, topLevelPaths } from "@/foundation/ui/kit/list/treeModel";
import type { ChangesSelection } from "./useFileTabs";
import { filesGitImpl, type FileGitAction, type FilesGitStatus } from "./filesGit";
import type { FileMenuTarget } from "./fileMenuItems";
import { filesApi } from "./api";
import { workdirInput } from "@/foundation/ui/api/workdir";

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
 * ファイルタブ・変更タブのファイル・フォルダの操作（右クリックの項目は fileMenuItems.ts、描くのは FileTreeMenu）。
 * - 名前の変更（選んでいる行で Enter を押すと名前の変更にする。ノートの木・チャットの行と同じ。右クリックの「名前を変更」でも）:
 *   同じフォルダの中で名前だけを変える（コアの POST /file/rename）。開いているファイル（とフォルダの中）で保存していない変更があれば、
 *   先に保存してもらう（名前を変えると編集中の中身と結びつかなくなるため）。変えたら、開いているファイルを新しいパスに付け替え（onMoved で開いたフォルダも）、Git の状態を取り直す。
 * - 新しいファイル・フォルダー（ファイルタブだけ。ノートの一覧と同じく、木の下の空いている所の右クリックでも）:
 *   VS Code と同じく、名前を書いてから作る（その場所に名前の欄を出す。Esc ならやめて何も残さない。Git の作業場所に仮の名前のファイルを残さないため）。
 *   「a/b.ts」と書けば途中のフォルダーも作る。作ったらファイルは開き、上のフォルダーを開く（onReveal）。
 * - ゴミ箱に入れる（ファイルタブだけ）: 確かめてから。開いていたファイルは閉じる（保存していない変更も捨てる。確かめの文で伝える）。
 *   いくつか選んでいれば確かめは 1 回（フォルダとその中を両方選んでいればフォルダだけ。失敗したものは最後にまとめて知らせる）
 */
export function useFileOps(
  projectId: number,
  {
    selection,
    git,
    onMoved,
    onReveal,
    gitRun,
  }: {
    selection: ChangesSelection;
    git: Pick<FilesGitStatus, "refresh">;
    onMoved?: (from: string, to: string) => void;
    /** そのフォルダーとその上を開く（名前の欄・作ったものを見せる） */
    onReveal?: (folder: string) => void;
    /** 変更の一覧で選んだもののステージ・ステージの取り消し・元に戻す */
    gitRun: (action: FileGitAction, paths: string[]) => void;
  },
) {
  const target = useWorkplace(projectId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState<FileCreate["creating"]>(null);
  const menu = useContextMenu<FileMenuTarget>();

  const start = (path: string) => {
    const unsaved = selection.dirtyUnder(path);
    if (unsaved) {
      void alert("保存していない変更があります", `「${baseName(unsaved)}」を保存してから、名前を変えてください。`);
      return;
    }
    setCreating(null);
    setRenaming(path);
  };
  const submit = (path: string, name: string) => {
    setRenaming(null);
    if (name === baseName(path)) return;
    void filesApi("POST /api/projects/:projectId/file/rename", { ...workdirInput(target), body: { path, name } })
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
    void filesApi("POST /api/projects/:projectId/files", { ...workdirInput(target), body: { path, dir } })
      .then(async () => {
        const folder = dir ? path : parentPath(path);
        if (folder) onReveal?.(folder);
        await git.refresh();
        if (!dir) void selection.setSelected({ path, focus: true }, true);
      })
      .catch(reportFailure(dir ? "フォルダーを作れませんでした" : "ファイルを作れませんでした"));
  };

  const trashOne = async (path: string, dir: boolean) => {
    const unsaved = selection.dirtyUnder(path) !== null;
    const ok = await confirm({
      title: dir ? `フォルダー「${baseName(path)}」をゴミ箱に入れますか？` : `「${baseName(path)}」をゴミ箱に入れますか？`,
      message: `${dir ? "中のファイルもすべてゴミ箱に入ります。" : ""}Kickoff のゴミ箱に ${TRASH_KEEP_DAYS} 日入り、その間はプロジェクトの「ゴミ箱」から戻せます。${unsaved ? "開いているファイルの保存していない変更は消えます。" : ""}`,
      confirmLabel: "ゴミ箱に入れる",
      danger: true,
    });
    if (!ok) return;
    await filesApi("DELETE /api/projects/:projectId/file", workdirInput(target, { path })).then(({ trash_id }) => {
      selection.forget(path);
      void git.refresh();
      showTrashedToast(trash_id, baseName(path));
    }, reportFailure("ゴミ箱に入れられませんでした"));
  };

  /** ゴミ箱に入れる（いくつかなら確かめは 1 回。フォルダとその中を両方選んでいればフォルダだけ。失敗したものは最後にまとめて知らせる） */
  const trash = async (entries: readonly PickedEntry[]) => {
    const tops = new Set(topLevelPaths(entries.map((n) => n.path)));
    const targets = entries.filter((n) => tops.has(n.path));
    if (targets.length === 1) return trashOne(targets[0].path, targets[0].dir);
    const names = targets.slice(0, 10).map((n) => `・${baseName(n.path)}${n.dir ? "（フォルダー）" : ""}`);
    if (targets.length > names.length) names.push(`ほか ${targets.length - names.length} 件`);
    const unsaved = targets.some((n) => selection.dirtyUnder(n.path) !== null);
    const ok = await confirm({
      title: `${targets.length} 件をゴミ箱に入れますか？`,
      message: `${names.join("\n")}\n\n${targets.some((n) => n.dir) ? "フォルダーの中のファイルもすべてゴミ箱に入ります。" : ""}Kickoff のゴミ箱に ${TRASH_KEEP_DAYS} 日入り、その間はプロジェクトの「ゴミ箱」から戻せます。${unsaved ? "開いているファイルの保存していない変更は消えます。" : ""}`,
      confirmLabel: "ゴミ箱に入れる",
      danger: true,
    });
    if (!ok) return;
    const failed: string[] = [];
    for (const { path } of targets) {
      try {
        await filesApi("DELETE /api/projects/:projectId/file", workdirInput(target, { path }));
        selection.forget(path);
      } catch (e) {
        failed.push(`${baseName(path)}: ${errorMessage(e)}`);
      }
    }
    void git.refresh();
    if (failed.length < targets.length) showToast(`${targets.length - failed.length} 件をゴミ箱に入れました（${TRASH_KEEP_DAYS} 日はプロジェクトの「ゴミ箱」から戻せます）`);
    if (failed.length > 0) await alert("ゴミ箱に入れられなかったものがあります", failed.join("\n"));
  };

  /** 変更の一覧で選んだもののステージ・取り消し・元に戻す（元に戻すは確かめてから） */
  const runGit = async (action: FileGitAction, paths: string[]) => {
    if (action === "discard" && !(await filesGitImpl().confirmDiscard(paths))) return;
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
  return { rename, create, trash, runGit, menu: menu.menu, closeMenu: menu.close };
}

export type FileOps = ReturnType<typeof useFileOps>;
