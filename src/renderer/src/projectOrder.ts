import type { ProjectSummary } from "../../core/types";
import { api } from "./api";
import { alertDialog, confirmDialog } from "./dialogs";
import { errorMessage } from "./errors";

/** サイドバーのプロジェクトの並べ方: 手動（ドラッグで並べ替えた順）/ 最近動いた順 */
export const PROJECT_ORDERS = ["manual", "recent"] as const;
export type ProjectOrder = (typeof PROJECT_ORDERS)[number];

/**
 * サイドバーに出すプロジェクトの並び: 上に固定したものを先に、そのあとドラッグで並べ替えた順（同じなら作成順）。
 * lastActive を渡すと、固定したものの次は最近動いた順（サイドバーの「最近動いた順」）。
 * しまった（アーカイブした）プロジェクトは出さない（切り替え・全プロジェクトの画面でも同じ）
 */
export const sidebarOrder = (projects: ProjectSummary[], lastActive?: (p: ProjectSummary) => string) =>
  projects
    .filter((p) => !p.archived_at)
    .sort((a, b) => b.pinned - a.pinned || (lastActive ? lastActive(b).localeCompare(lastActive(a)) : 0) || a.position - b.position || a.id - b.id);

/** しまった（アーカイブした）プロジェクト（名前順） */
export const archivedProjects = (projects: ProjectSummary[]) => projects.filter((p) => p.archived_at).sort((a, b) => a.name.localeCompare(b.name));

/** 上に固定する・やめる、しまう・戻す（右クリックのメニュー・見出しのピン・戻すボタンで共通。失敗はお知らせのダイアログで出す） */
export const changeProject = (id: number, patch: { pinned?: boolean; archived?: boolean }) =>
  void api.updateProject(id, patch).catch((e: unknown) => alertDialog("変更できませんでした", errorMessage(e)));

/** 確かめてから、プロジェクトをアーカイブする（やめたら何もしない。戻すときは確かめない） */
export async function confirmArchiveProject(project: Pick<ProjectSummary, "id" | "name">) {
  const ok = await confirmDialog({
    title: `プロジェクト「${project.name}」をアーカイブしますか？`,
    message:
      "サイドバー・プロジェクトの切り替え・全プロジェクトの画面に出なくなります。チャットや記録は消えません。サイドバーの「プロジェクト」の行の「アーカイブ」を「表示する」にすると出せ、右クリックのメニューから戻せます。",
    confirmLabel: "アーカイブ",
  });
  if (ok) changeProject(project.id, { archived: true });
}
