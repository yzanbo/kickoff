// 新しいチャットの作成先の決め方（⌘N・サイドバーで選ぶプロジェクトの既定。純粋。作成先を選び直す札の選択肢は @shared/projects/order の chatTargetChoices）
import { isActiveUserProject, isCommonProject } from "@shared/projects/kinds";
import type { Project } from "@shared/projects/types";
import { sidebarOrder } from "@shared/projects/order";
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
