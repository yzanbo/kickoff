import type { ProjectSummary } from "../../core/types";
import { api } from "./api";
import { alertDialog } from "./dialogs";
import { errorMessage } from "./errors";

/**
 * サイドバーに出すプロジェクトの並び: 上に固定したものを先に、そのあとドラッグで並べ替えた順（同じなら作成順）。
 * しまった（アーカイブした）プロジェクトは出さない（切り替え・全プロジェクトの画面でも同じ）
 */
export const sidebarOrder = (projects: ProjectSummary[]) =>
  projects.filter((p) => !p.archived_at).sort((a, b) => b.pinned - a.pinned || a.position - b.position || a.id - b.id);

/** しまった（アーカイブした）プロジェクト（名前順） */
export const archivedProjects = (projects: ProjectSummary[]) => projects.filter((p) => p.archived_at).sort((a, b) => a.name.localeCompare(b.name));

/** 上に固定する・やめる、しまう・戻す（右クリックのメニュー・見出しのピン・戻すボタンで共通。失敗はお知らせのダイアログで出す） */
export const changeProject = (id: number, patch: { pinned?: boolean; archived?: boolean }) =>
  void api.updateProject(id, patch).catch((e: unknown) => alertDialog("変更できませんでした", errorMessage(e)));
