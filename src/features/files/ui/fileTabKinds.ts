// ファイルのタブの種類: チャットの画面の右の欄のファイル（file）と、プロジェクトの「ファイル」「検索」「変更」タブの右のファイル（projectFile）。ui/contributes.ts が panelTabs に入れる
import { FileText } from "lucide-react";
import { baseName } from "@/foundation/ui/lib/format";
import { defineTabKind } from "@/features/panel/ui";
import { FileTabLead } from "./FileTabLead";
import { FilePage, ProjectFileFace, ProjectFilePage, type FileTab, type ProjectFileTabData } from "./fileTabPages";
import { confirmCloseFileTab } from "./fileTabs";
import { repointFileTab } from "./fileTabModel";

export const fileTabKind = defineTabKind<FileTab>({
  id: "file",
  icon: FileText,
  // アイコンはエディタと同じファイルの種類のアイコン
  Lead: FileTabLead,
  label: (t) => baseName(t.path),
  hint: (t) => (t.line ? `${t.path}（${t.line} 行目）` : t.path),
  projectOf: (t) => t.projectId,
  // 開いたチャットを消したら閉じる（チャットごとの欄なので、欄ごと使われなくなる）
  ownerChatId: (t) => t.chatId,
  popout: (t) => ({
    route: { kind: "file", chatId: t.chatId, projectId: t.projectId, path: t.path, ...(t.worktree ? { worktree: t.worktree } : {}), ...(t.line ? { line: t.line } : {}) },
    title: t.path,
  }),
  // 開き直したら目立たせる行だけ変える
  reopen: (t) => ({ kind: "file", fields: { line: t.line } }),
  repoint: repointFileTab,
  Page: FilePage,
});

export const projectFileTabKind = defineTabKind<ProjectFileTabData>({
  id: "projectFile",
  icon: FileText,
  Lead: FileTabLead,
  // 差分のタブは、同じファイルの中身のタブと見分ける（VS Code の「(Working Tree)」「(Index)」と同じ）
  label: (t) => `${baseName(t.path)}${t.staged === undefined || t.line !== undefined ? "" : t.staged ? "（ステージ済み）" : "（変更）"}`,
  hint: (t) => (t.line ? `${t.path}（${t.line} 行目）` : t.path),
  projectOf: (t) => t.projectId,
  // 見ていないタブのファイルまで読み込まない
  createWhen: "shown",
  // 保存していない書きかけがあれば保存するかを聞く
  confirmClose: (t, panel) => confirmCloseFileTab(panel, t.key),
  Face: ProjectFileFace,
  Page: ProjectFilePage,
});
