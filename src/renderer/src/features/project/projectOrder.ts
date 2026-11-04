import type { Chat, Project } from "@shared/types";
import { api } from "@/api";
import type { SettingValue } from "@/lib/storage";
import type { SIDEBAR_PROJECT_ORDER } from "@/lib/storageKeys";
import { alertDialog, confirmDialog } from "@/ui/dialogs";
import { errorMessage } from "@shared/errors";

/** サイドバーのプロジェクトの並べ方: 手動（ドラッグで並べ替えた順）/ 最近動いた順 */
export type ProjectOrder = SettingValue<typeof SIDEBAR_PROJECT_ORDER>;

/**
 * サイドバーに出すプロジェクトの並び: 上に固定したものを先に、そのあとドラッグで並べ替えた順（同じなら作成順）。
 * lastActive を渡すと、固定したものの次は最近動いた順（サイドバーの「最近動いた順」）。
 * しまった（アーカイブした）プロジェクトは出さない（切り替え・全プロジェクトの画面でも同じ）
 */
export const sidebarOrder = (projects: Project[], lastActive?: (p: Project) => string) =>
  projects
    .filter((p) => !p.archived_at)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (lastActive ? lastActive(b).localeCompare(lastActive(a)) : 0) || a.position - b.position || a.id - b.id);

/**
 * 「最近動いた順」のサイドバーの並び: 固定したものが先、そのあとプロジェクトのチャット（アーカイブしたものを除く）が最後に動いた順
 * （チャットがなければ作った時刻）。chats は最後に動いた順（店の一覧の並び）
 */
export function recentOrder(projects: Project[], chats: readonly Chat[]): Project[] {
  const latest = new Map<number, string>();
  for (const chat of chats) if (!chat.archived_at && !latest.has(chat.project_id)) latest.set(chat.project_id, chat.active_at);
  return sidebarOrder(projects, (p) => latest.get(p.id) ?? p.created_at);
}

/** しまった（アーカイブした）プロジェクト（名前順） */
export const archivedProjects = (projects: Project[]) => projects.filter((p) => p.archived_at).sort((a, b) => a.name.localeCompare(b.name));

/** 上に固定する・やめる、しまう・戻す、タグを付け外す（右クリックのメニュー・見出しのピン・戻すボタンで共通。失敗はお知らせのダイアログで出す） */
export const changeProject = (id: number, patch: { pinned?: boolean; archived?: boolean; tags?: string[] }) =>
  void api.updateProject(id, patch).catch((e: unknown) => alertDialog("変更できませんでした", errorMessage(e)));

/** 確かめてから、プロジェクトをアーカイブから戻す（やめたら何もしない） */
export async function confirmRestoreProject(project: Pick<Project, "id" | "name">) {
  const ok = await confirmDialog({
    title: `プロジェクト「${project.name}」をアーカイブから戻しますか？`,
    message: "サイドバー・プロジェクトの切り替え・全プロジェクトの画面に、また出るようになります。",
    confirmLabel: "戻す",
  });
  if (ok) changeProject(project.id, { archived: false });
}

/** 確かめてから、プロジェクトをアーカイブする（やめたら何もしない） */
export async function confirmArchiveProject(project: Pick<Project, "id" | "name">) {
  const ok = await confirmDialog({
    title: `プロジェクト「${project.name}」をアーカイブしますか？`,
    message:
      "サイドバー・プロジェクトの切り替え・全プロジェクトの画面に出なくなります。チャットや記録は消えません。サイドバーの「プロジェクト」の行の「アーカイブ」を「表示する」にすると出せ、右クリックのメニューから戻せます。",
    confirmLabel: "アーカイブ",
  });
  if (ok) changeProject(project.id, { archived: true });
}
