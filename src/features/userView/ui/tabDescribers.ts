// パネルのタブの中身を AI に説明する口（get_user_view）: タブの種類の持ち主が ui/contributes.ts で userViewTabs.item({ kind, describe }) を出す。
// 説明の形を作る補助（エディタ・ノート・GitHub。DB は userViewCollect.ts）は、パネルのタブと別ウィンドウ・プロジェクトのタブで共通
import { USER_VIEW_TEXT_MAX, type UserViewTab } from "@shared/userView/types";
import { definePoint } from "@/foundation/ui/points";
import { readSetting } from "@/foundation/ui/storage";
import { githubSelected } from "@/foundation/ui/storage/storageKeys";
import { editorCursorOf, noteSelectionOf } from "@/foundation/ui/lib/viewDetails";
import type { PanelTab } from "@/features/panel/ui";

/** 種類のタブ 1 つの説明（kind はタブの種類。中身の型は describeTab で種類に合わせる） */
export interface UserViewTabDescriber {
  kind: PanelTab["kind"];
  describe(tab: PanelTab): UserViewTab;
}

/** タブの説明の拡張点（説明のない種類は、種類の名前の画面（page）として説明する。userViewCollect.ts） */
export const userViewTabs = definePoint<UserViewTabDescriber>("userViewTabs", { key: (d) => d.kind });

/** 種類 K のタブの説明を 1 つ作る（登録はしない） */
export const describeTab = <K extends PanelTab["kind"]>(kind: K, describe: (tab: Extract<PanelTab, { kind: K }>) => UserViewTab): UserViewTabDescriber => ({
  kind,
  describe: (tab) => describe(tab as Extract<PanelTab, { kind: K }>),
});

/** 選んだ文は長ければ切る */
const clip = (s: string | null) => (s !== null && s.length > USER_VIEW_TEXT_MAX ? `${s.slice(0, USER_VIEW_TEXT_MAX)}…` : s);

/** GitHub のタブ・右の欄で開いている issue・PR（「issue:12」「pr:5」） */
export function githubView(projectId: number): UserViewTab {
  const m = /^(issue|pr):(\d+)$/.exec(readSetting(githubSelected(projectId)));
  return { kind: "github", item: m ? { kind: m[1] as "issue" | "pr", number: Number(m[2]) } : null, project_id: projectId };
}

/** エディタのタブ（カーソルと選んでいる範囲は開いている部品から） */
export function editorView(projectId: number, path: string, worktree: string | null, line: number | undefined): UserViewTab {
  const cursor = editorCursorOf(projectId, path);
  return { kind: "editor", path, worktree, line: cursor?.line ?? line ?? null, selection: cursor?.selection ?? null, project_id: projectId };
}

/** ノート（選んでいる文は開いている部品から） */
export const noteView = (projectId: number, path: string): UserViewTab => ({ kind: "note", path, selected_text: clip(noteSelectionOf(projectId, path)), project_id: projectId });
