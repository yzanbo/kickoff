import { useMemo } from "react";
import type { ProjectFiles } from "@shared/foundation/fileTypes";
import { open } from "@/foundation/ui/navigation/open";
import { openPopout } from "@/foundation/ui/navigation/popout";
import { filesGitImpl } from "@/features/files/ui/filesGit";
import { useWorkplaceFiles } from "@/features/files/ui/filesStore";
import { changesTab, fileTab, openTab, reopenOf } from "@/features/panel/ui";
import { chatSidePanel } from "@/features/chat/ui";
import { useIsCommonProject } from "@/features/projects/ui";
import type { ChatFileLinks, ChatFilePlace, ChatFileSource } from "@/features/chat/ui";
import { buildFileIndex, type FileIndex, type FileRef } from "./fileRefs";
import { fileLinkPlaceOf } from "./linkPlace";

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
 * なければ・行の番号があればファイルのタブ）。置けなければファイルタブ（共通のチャットは別ウィンドウ）。一覧が読めない（フォルダが消えたなど）間は undefined（チップにしない）
 */
export function useFileLinks(place: ChatFilePlace, version: unknown): FileLinkSource | undefined {
  const { chatId, projectId, worktree, root, side } = place;
  const common = useIsCommonProject(projectId);
  const { data } = useWorkplaceFiles({ projectId, worktree: worktree ?? null }, { version });
  return useMemo(() => (data && root ? fileLinksFor({ files: data, root, projectId, worktree, chatId, side, common }) : undefined), [data, root, projectId, worktree, chatId, side, common]);
}

/**
 * 作業場所のファイルの一覧から、押して開くための情報を作る（いまの作業場所と、作業場所を移す前の作業場所（pastWorkplaces.tsx）で同じ形）。
 * 開くのはその作業場所（worktree。本体なら undefined）のファイル・変更。共通のチャット（common）は共通の画面にファイルのタブがないので、
 * 右の欄を置けなければそのファイルだけの別ウィンドウで開き、「ファイルタブで開く」は出さない（openInEditor が null）
 */
export function fileLinksFor({
  files,
  root,
  projectId,
  worktree,
  chatId,
  side,
  common,
}: {
  files: ProjectFiles;
  root: string;
  projectId: number;
  worktree: string | undefined;
  chatId: number;
  side: boolean;
  common: boolean;
}): FileLinkSource {
  const place = { projectId, ...(worktree ? { worktree } : {}) };
  const at = fileLinkPlaceOf({ side, common });
  const openInTab = (ref: FileRef) => open({ kind: "file", projectId, ...ref, worktree });
  // 別ウィンドウの中のリンクも別ウィンドウで開く（PopoutFiles の popoutFileLinks）
  const openInWindow = (ref: FileRef) => openPopout({ kind: "file", chatId, ...place, ...ref }, ref.path);
  const openOffSide = at === "window" ? openInWindow : openInTab;
  const sidePanel = chatSidePanel(chatId);
  const openChanges = (focus?: string) => {
    if (at !== "side") return focus ? openOffSide({ path: focus }) : undefined;
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
    openInEditor: common ? null : openInTab,
    openChanges,
    open: (ref: FileRef) => (at === "side" ? openFileRef(ref, place, { file: openFile, changes: openChanges }) : openOffSide(ref)),
  };
}
