import { useMemo } from "react";
import type { ProjectFiles } from "@shared/types";
import { api } from "@/api";
import { useKeyedAsync } from "@/hooks/useKeyedAsync";
import { openProjectFile } from "@/app/router";
import { changeOf } from "@/features/editor/sideFile";
import { panelActions } from "@/features/panel/state/panelActions";
import { panelKey } from "@/features/panel/surfaces";
import type { FileLinks } from "./fileLinkContext";
import { buildFileIndex, type FileRef } from "./fileRefs";

/** 取り直した一覧が前と同じか（同じなら描き直さない） */
const sameFiles = (a: ProjectFiles, b: ProjectFiles) => a.truncated === b.truncated && a.files.join("\n") === b.files.join("\n");

/** useFileLinks が返すもの（右クリックのメニューは FileLinksProvider が足す） */
export type ChatFileLinks = Omit<FileLinks, "showMenu">;

/**
 * 押したファイルの開き方を決める（右の欄・別ウィンドウで共通）: 行の番号があれば中身（その行を目立たせる）、作業場所にコミットしていない変更があれば
 * 変更のそのファイルの位置、なければ中身（Git の状態が読めなければ中身）
 */
export function openFileRef(ref: FileRef, place: { projectId: number; worktree?: string }, to: { file: (ref: FileRef) => void; changes: (focus: string) => void }) {
  if (ref.line) return to.file(ref);
  api.gitStatus(place).then(
    (status) => (changeOf(status, ref.path) ? to.changes(ref.path) : to.file(ref)),
    () => to.file(ref),
  );
}

/**
 * チャットの中のファイルを押して開くための情報（FileLinkContext に入れる）。
 * チャットの作業場所（ワークツリーならそのフォルダ、なければ本体）のファイルの一覧を読み、作業が終わるたびに読み直す（新しく作ったファイルもチップにする）。
 * side（チャットの画面の右の欄を置ける）なら、押したファイルを右の欄に開き、会話は左に残す（コミットしていない変更があれば変更のタブのその位置、
 * なければ・行の番号があればファイルのタブ）。置けなければファイルタブ。一覧が読めない（フォルダが消えたなど）間は undefined（チップにしない）
 */
export function useFileLinks(
  chat: { id: number; project_id: number; worktree_path: string | null; status: string },
  repoPath: string | undefined,
  side: boolean,
): ChatFileLinks | undefined {
  const projectId = chat.project_id;
  const chatId = chat.id;
  const worktree = chat.worktree_path || undefined;
  const root = worktree ?? repoPath;
  const { data } = useKeyedAsync(`${projectId}:${worktree ?? ""}`, () => api.projectFiles({ projectId, worktree }), {
    deps: [chat.status],
    same: sameFiles,
  });
  return useMemo(() => {
    if (!data || !root) return undefined;
    const place = { projectId, ...(worktree ? { worktree } : {}) };
    const openInEditor = (ref: FileRef) => openProjectFile(projectId, { ...ref, ...(worktree ? { worktree } : {}) });
    const actions = () => panelActions(panelKey("agents", chatId));
    const openChanges = (focus?: string) => {
      if (!side) return focus ? openInEditor({ path: focus }) : undefined;
      actions().openChanges({ chatId, ...place, ...(focus ? { focus } : {}) });
    };
    const openFile = (ref: FileRef) => actions().openFile({ chatId, ...place, ...ref });
    return {
      index: buildFileIndex(data.files, root, data.truncated),
      side,
      openInEditor,
      openChanges,
      open: (ref: FileRef) => (side ? openFileRef(ref, place, { file: openFile, changes: openChanges }) : openInEditor(ref)),
    };
  }, [data, root, projectId, worktree, chatId, side]);
}
