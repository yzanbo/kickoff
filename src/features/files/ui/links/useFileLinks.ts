import { useMemo } from "react";
import type { ProjectFiles } from "@shared/foundation/fileTypes";
import { open } from "@/foundation/ui/navigation/open";
import { filesGitImpl } from "@/features/files/ui/filesGit";
import { useWorkplaceFiles } from "@/features/files/ui/filesStore";
import { changesTab, fileTab, openTab, reopenOf } from "@/features/panel/ui";
import { chatSidePanel } from "@/features/chat/ui";
import type { ChatFileLinks, ChatFilePlace, ChatFileSource } from "@/features/chat/ui";
import { buildFileIndex, type FileIndex, type FileRef } from "./fileRefs";

/** リンクの元（チャットの口の ChatFileSource の中身）: 作業場所のファイルの一覧（ここにあるものだけをチップにする。root は作業場所のフォルダ）と開き方。右クリックのメニューは FileLinksProvider が足す */
export interface FileLinkSource extends ChatFileSource, Pick<ChatFileLinks, "open" | "openInEditor" | "openChanges"> {
  index: FileIndex;
}

/**
 * 押したファイルの開き方を決める（右の欄・別ウィンドウで共通）: 行の番号があれば中身（その行を目立たせる）、作業場所にコミットしていない変更があれば
 * 変更のそのファイルの位置、なければ中身（Git の状態が読めなければ中身）
 */
export function openFileRef(ref: FileRef, place: { projectId: number; worktree?: string }, to: { file: (ref: FileRef) => void; changes: (focus: string) => void }) {
  if (ref.line) return to.file(ref);
  void filesGitImpl()
    .hasChange({ projectId: place.projectId, worktree: place.worktree ?? null }, ref.path)
    .then((changed) => (changed ? to.changes(ref.path) : to.file(ref)));
}

/**
 * チャットの中のファイルを押して開くための情報（FileLinksProvider に渡す）。
 * チャットの作業場所（ワークツリーならそのフォルダ、なければ本体）のファイルの一覧を読み、作業が終わるたびに読み直す（新しく作ったファイルもチップにする）。
 * side（チャットの画面の右の欄を置ける）なら、押したファイルを右の欄に開き、会話は左に残す（コミットしていない変更があれば変更のタブのその位置、
 * なければ・行の番号があればファイルのタブ）。置けなければファイルタブ。一覧が読めない（フォルダが消えたなど）間は undefined（チップにしない）
 */
export function useFileLinks(place: ChatFilePlace, version: unknown): FileLinkSource | undefined {
  const { chatId, projectId, worktree, root, side } = place;
  const { data } = useWorkplaceFiles({ projectId, worktree: worktree ?? null }, { version });
  return useMemo(() => (data && root ? fileLinksFor({ files: data, root, projectId, worktree, chatId, side }) : undefined), [data, root, projectId, worktree, chatId, side]);
}

/**
 * 作業場所のファイルの一覧から、押して開くための情報を作る（いまの作業場所と、作業場所を移す前の作業場所（pastWorkplaces.tsx）で同じ形）。
 * 開くのはその作業場所（worktree。本体なら undefined）のファイル・変更
 */
export function fileLinksFor({
  files,
  root,
  projectId,
  worktree,
  chatId,
  side,
}: {
  files: ProjectFiles;
  root: string;
  projectId: number;
  worktree: string | undefined;
  chatId: number;
  side: boolean;
}): FileLinkSource {
  const place = { projectId, ...(worktree ? { worktree } : {}) };
  const openInEditor = (ref: FileRef) => open({ kind: "file", projectId, ...ref, worktree });
  const sidePanel = chatSidePanel(chatId);
  const openChanges = (focus?: string) => {
    if (!side) return focus ? openInEditor({ path: focus }) : undefined;
    const tab = changesTab({ chatId, ...place, ...(focus ? { focus } : {}) });
    openTab(sidePanel, tab, reopenOf(tab));
  };
  const openFile = (ref: FileRef) => {
    const tab = fileTab({ chatId, ...place, ...ref });
    openTab(sidePanel, tab, reopenOf(tab));
  };
  return {
    index: buildFileIndex(files.files, root, files.truncated),
    side,
    openInEditor,
    openChanges,
    open: (ref: FileRef) => (side ? openFileRef(ref, place, { file: openFile, changes: openChanges }) : openInEditor(ref)),
  };
}
