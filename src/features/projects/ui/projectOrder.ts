import { isUserProject } from "@shared/projects/kinds";
import { sidebarOrder } from "@shared/projects/order";
import type { Project } from "@shared/projects/types";
import { projectsApi } from "@/features/projects/ui/api/projects";
import { alert, confirm } from "@/foundation/ui/kit/ask";
import { errorMessage } from "@shared/foundation/errors";

/** 並べ替えられるプロジェクトの ID（並び projects のうち利用者のもの。共通はいつも先頭なので、並べ替えの鍵にも保存する並びにも入れない） */
export const reorderableIds = (projects: readonly Project[]): number[] => projects.filter(isUserProject).map((p) => p.id);

/**
 * 「最近動いた順」のサイドバーの並び: 固定したものが先、そのあとプロジェクトのチャット（アーカイブしたものを除く）が最後に動いた順
 * （チャットがなければ作った時刻）。chats は最後に動いた順（店の一覧の並び）
 */
export function recentOrder(projects: Project[], chats: readonly { project_id: number; active_at: string; archived_at: string | null }[]): Project[] {
  const latest = new Map<number, string>();
  for (const chat of chats) if (!chat.archived_at && !latest.has(chat.project_id)) latest.set(chat.project_id, chat.active_at);
  return sidebarOrder(projects, (p) => latest.get(p.id) ?? p.created_at);
}

/** しまった（アーカイブした）プロジェクト（名前順。しまえるのは利用者のプロジェクトだけで、共通はいつも先頭に出す） */
export const archivedProjects = (projects: Project[]) => projects.filter((p) => p.archived_at && isUserProject(p)).sort((a, b) => a.name.localeCompare(b.name));

/** 上に固定する・やめる、しまう・戻す、タグを付け外す（右クリックのメニュー・見出しのピン・戻すボタンで共通。失敗はお知らせのダイアログで出す） */
export const changeProject = (id: number, patch: { pinned?: boolean; archived?: boolean; tags?: string[] }) =>
  void projectsApi.updateProject(id, patch).catch((e: unknown) => alert("変更できませんでした", errorMessage(e)));

/** 確かめてから、プロジェクトをアーカイブから戻す（やめたら何もしない） */
export async function confirmRestoreProject(project: Pick<Project, "id" | "name">) {
  const ok = await confirm({
    title: `プロジェクト「${project.name}」をアーカイブから戻しますか？`,
    message: "サイドバー・プロジェクトの切り替え・全プロジェクトの画面に、また出るようになります。",
    confirmLabel: "戻す",
  });
  if (ok) changeProject(project.id, { archived: false });
}

/** 確かめてから、プロジェクトをアーカイブする（やめたら何もしない） */
export async function confirmArchiveProject(project: Pick<Project, "id" | "name">) {
  const ok = await confirm({
    title: `プロジェクト「${project.name}」をアーカイブしますか？`,
    message:
      "サイドバー・プロジェクトの切り替え・全プロジェクトの画面に出なくなります。チャットや記録は消えません。サイドバーの「プロジェクト」の行の「アーカイブ」を「表示する」にすると出せ、右クリックのメニューから戻せます。",
    confirmLabel: "アーカイブ",
  });
  if (ok) changeProject(project.id, { archived: true });
}
