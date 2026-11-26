// 利用者に見せるプロジェクトの並びと、新しいチャットの作成先の選択肢（純粋。パソコンの画面とスマホで同じ並びにする）
import { isActiveProject, isCommonProject, type ProjectKind } from "./kinds";
import type { Project } from "./types";

/** 共通を先頭に寄せる（ほかの並びは変えない。サイドバーの並びと ⌘K のプロジェクトで同じ決まり） */
export const commonFirst = <T extends { kind: ProjectKind | null }>(projects: readonly T[]): T[] => [...projects.filter(isCommonProject), ...projects.filter((p) => !isCommonProject(p))];

/**
 * サイドバーに出すプロジェクトの並び: 先頭に共通（いつも。固定したものより前で、並べ替え・固定の外）、そのあと上に固定したもの、
 * そのあとドラッグで並べ替えた順（同じなら作成順）。lastActive を渡すと、固定したものの次は最近動いた順（サイドバーの「最近動いた順」）。
 * しまった（アーカイブした）プロジェクトは出さない（切り替え・全プロジェクトの画面・スマホの一覧でも同じ）
 */
export const sidebarOrder = (projects: readonly Project[], lastActive?: (p: Project) => string): Project[] => {
  return commonFirst(
    projects
      .filter(isActiveProject)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (lastActive ? lastActive(b).localeCompare(lastActive(a)) : 0) || a.position - b.position || a.id - b.id),
  );
};

/**
 * 新しいチャットの作成先を選び直す札の選択肢: 共通を先頭に、アーカイブしていない利用者のプロジェクト（サイドバーの並び）。
 * いまの作成先がその中になければ（アーカイブしたプロジェクトで始めた下書き）いちばん下に足す（チェックを付けて見せるため）。値は ID の文字
 */
export function chatTargetChoices(projects: readonly Project[], current: number): { values: string[]; labels: Record<string, string> } {
  const listed = sidebarOrder(projects);
  const shown = listed.some((p) => p.id === current) ? listed : [...listed, ...projects.filter((p) => p.id === current)];
  return { values: shown.map((p) => String(p.id)), labels: Object.fromEntries(shown.map((p) => [String(p.id), p.name])) };
}
