import { useMemo, type ReactNode } from "react";
import { openPopout, type PopoutRoute } from "@/foundation/ui/navigation/popout";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { baseName } from "@/foundation/ui/lib/format";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { SideScope } from "@/features/conversation/ui";
import { SideFileView } from "./SideFileView";
import { FileLinksProvider } from "@/features/files/ui/links/FileLinksProvider";
import type { FileRef } from "@/features/files/ui/links/fileRefs";
import { openFileRef, useFileLinks, type FileLinkSource } from "@/features/files/ui/links/useFileLinks";

/**
 * 別ウィンドウのファイル（作業場所の変更・中身）の開き方: 変更・中身は別ウィンドウで開き、「ファイルタブで開く」はメインのウィンドウで開く
 * （このウィンドウには、ファイルタブがないため）
 */
export function usePopoutFileLinks(base: FileLinkSource | undefined, place: { chatId: number; projectId: number; worktree?: string }): FileLinkSource | undefined {
  const { chatId, projectId, worktree } = place;
  return useMemo(() => (base ? popoutFileLinks(base, { chatId, projectId, worktree }) : undefined), [base, chatId, projectId, worktree]);
}

/** 別ウィンドウの開き方に直す（作業場所を移す前の区間の開き方にも使う。PastWorkplacesProvider の adapt） */
export function popoutFileLinks(base: FileLinkSource, { chatId, projectId, worktree }: { chatId: number; projectId: number; worktree?: string }): FileLinkSource {
  const at = { projectId, ...(worktree ? { worktree } : {}) };
  const openChanges = (focus?: string) => openPopout({ kind: "changes", chatId, ...at, ...(focus ? { focus } : {}) }, `変更 — ${worktree ? `ワークツリー ${baseName(worktree)}` : "本体"}`);
  const openFile = (ref: FileRef) => openPopout({ kind: "file", chatId, ...at, ...ref }, ref.path);
  return {
    ...base,
    side: false,
    openChanges,
    openInEditor: (ref) => openTarget({ kind: "file", projectId, ...ref, ...(worktree ? { worktree } : {}) }, { surface: "page" }),
    open: (ref) => openFileRef(ref, at, { file: openFile, changes: openChanges }),
  };
}

/** 別ウィンドウの変更・ファイルの枠: ファイルのリンクを別ウィンドウの開き方にし、右の欄と同じく開いたチャットを「メインのチャット」にする（SideScope） */
export function PopoutFilesFrame({ chatId, projectId, worktree, children }: { chatId: number; projectId: number; worktree?: string; children: ReactNode }) {
  const { projectsById } = useProjects();
  const base = useFileLinks({ chatId, projectId, worktree, root: worktree ?? projectsById.get(projectId)?.repo_path, side: false }, "");
  const links = usePopoutFileLinks(base, { chatId, projectId, worktree });
  return (
    <SideScope mainChatId={chatId}>
      <FileLinksProvider source={links}>
        <div className="popout-body">{children}</div>
      </FileLinksProvider>
    </SideScope>
  );
}

/** 別ウィンドウの「ファイル」（チャットの画面の右の欄と同じ中身） */
export function FilePopoutPage({ route }: { route: Extract<PopoutRoute, { kind: "file" }> }) {
  return (
    <PopoutFilesFrame chatId={route.chatId} projectId={route.projectId} worktree={route.worktree}>
      <SideFileView projectId={route.projectId} worktree={route.worktree} path={route.path} line={route.line} />
    </PopoutFilesFrame>
  );
}
