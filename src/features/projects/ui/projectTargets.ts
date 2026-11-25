// 新しいチャットの作成先の決め方（⌘N・サイドバーで選ぶプロジェクトの既定）と、作成先を選び直す札の選択肢（純粋）
import { isActiveUserProject, isCommonProject } from "@shared/projects/kinds";
import type { Project } from "@shared/projects/types";
import { sidebarOrder } from "./projectOrder";
import type { ProjectsIndex } from "./stores/projects";

/**
 * 覚えがない・もうないときに選ぶプロジェクト: 並び projects のうち利用者のプロジェクト（アーカイブしていない）の先頭、1 つもなければ共通。
 * 利用者のプロジェクトがあるのに初めから共通を選ばない（共通は並びの先頭にいるが、作業の中心は利用者のプロジェクトのため）
 */
export const firstTargetOf = (projects: readonly Project[]): number | undefined => (projects.find(isActiveUserProject) ?? projects.find(isCommonProject))?.id;

/**
 * URL にプロジェクトがないときの作成先: サイドバーで最後に選んだもの（共通も。もうないものは飛ばす）→ サイドバーの並びの firstTargetOf。
 * 一覧が届く前は覚えたものをそのまま返す（missing は届くまで false）
 */
export const fallbackTargetOf = (current: number | undefined, { projects, missing }: Pick<ProjectsIndex, "projects" | "missing">): number | undefined =>
  current !== undefined && !missing(current) ? current : firstTargetOf(sidebarOrder(projects));

/**
 * 新しいチャットの作成先を選び直す札の選択肢: 共通を先頭に、アーカイブしていない利用者のプロジェクト（サイドバーの並び）。
 * いまの作成先がその中になければ（アーカイブしたプロジェクトで始めた下書き）いちばん下に足す（チェックを付けて見せるため）。値は ID の文字
 */
export function chatTargetChoices(projects: readonly Project[], current: number): { values: string[]; labels: Record<string, string> } {
  const listed = sidebarOrder([...projects]);
  const shown = listed.some((p) => p.id === current) ? listed : [...listed, ...projects.filter((p) => p.id === current)];
  return { values: shown.map((p) => String(p.id)), labels: Object.fromEntries(shown.map((p) => [String(p.id), p.name])) };
}
