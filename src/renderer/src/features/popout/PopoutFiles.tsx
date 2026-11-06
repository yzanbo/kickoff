import { useEffect, useMemo, useState } from "react";
import { openPopout, popoutKey, type PopoutRoute } from "@/app/popout";
import { postToMainWindow, subscribeWindowMessages } from "@/app/windowBus";
import { baseName } from "@/lib/format";
import { useProjects } from "@/stores/projects";
import { SideChanges } from "@/features/editor/SideChanges";
import { SideFileView } from "@/features/editor/SideFileView";
import { FileLinksProvider } from "@/features/fileLinks/FileLinksProvider";
import type { FileRef } from "@/features/fileLinks/fileRefs";
import { openFileRef, useFileLinks, type ChatFileLinks } from "@/features/fileLinks/useFileLinks";

type FilesRoute = Extract<PopoutRoute, { kind: "changes" | "file" }>;

/**
 * 別ウィンドウのファイル（作業場所の変更・中身）の開き方: 変更・中身は別ウィンドウで開き、「ファイルタブで開く」はメインのウィンドウで開く
 * （このウィンドウには、ファイルタブがないため）
 */
export function usePopoutFileLinks(base: ChatFileLinks | undefined, place: { chatId: number; projectId: number; worktree?: string }): ChatFileLinks | undefined {
  const { chatId, projectId, worktree } = place;
  return useMemo(() => {
    if (!base) return undefined;
    const at = { projectId, ...(worktree ? { worktree } : {}) };
    const openChanges = (focus?: string) => openPopout({ kind: "changes", chatId, ...at, ...(focus ? { focus } : {}) }, `変更 — ${worktree ? `ワークツリー ${baseName(worktree)}` : "本体"}`);
    const openFile = (ref: FileRef) => openPopout({ kind: "file", chatId, ...at, ...ref }, ref.path);
    return {
      ...base,
      side: false,
      openChanges,
      openInEditor: (ref) => postToMainWindow({ type: "openProjectFile", projectId, file: { ...ref, ...(worktree ? { worktree } : {}) } }),
      open: (ref) => openFileRef(ref, at, { file: openFile, changes: openChanges }),
    };
  }, [base, chatId, projectId, worktree]);
}

/**
 * 別ウィンドウの「変更」「ファイル」（チャットの画面の右の欄と同じ中身）。行の「チャットに追加」・右クリックの「メインのチャット」は、メインのウィンドウのそのチャットのチャット欄に足す（PopoutApp の SideScope）。
 * 変更は、もう開いているウィンドウへの「このファイルの位置へ」の知らせ（popoutFocus）でも移る
 */
export function PopoutFiles({ route }: { route: FilesRoute }) {
  const { chatId, projectId, worktree } = route;
  const { projectsById } = useProjects();
  const base = useFileLinks({ id: chatId, project_id: projectId, worktree_path: worktree ?? null, status: "" }, projectsById.get(projectId)?.repo_path, false);
  const links = usePopoutFileLinks(base, { chatId, projectId, worktree });
  // 移るファイル（初めは URL のもの。開いているときに、ほかの所から同じウィンドウを開き直されたら知らせで受け取る）
  const [focus, setFocus] = useState({ path: route.kind === "changes" ? route.focus : undefined, at: Date.now() });
  useEffect(
    () =>
      subscribeWindowMessages((m) => {
        if (m.type === "popoutFocus" && m.key === popoutKey(route)) setFocus({ path: m.focus, at: Date.now() });
      }),
    [route],
  );
  return (
    <FileLinksProvider value={links}>
      <div className="popout-body">
        {route.kind === "changes" ? (
          <SideChanges projectId={projectId} worktree={worktree} focus={focus.path} focusAt={focus.at} />
        ) : (
          <SideFileView projectId={projectId} worktree={worktree} path={route.path} line={route.line} />
        )}
      </div>
    </FileLinksProvider>
  );
}
