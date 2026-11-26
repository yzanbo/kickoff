// プロジェクトの種類。利用者が作るふつうのプロジェクトは種類なし（null）で、種類のあるものは Kickoff が用意するプロジェクト。
// 判定は、利用者が作ったプロジェクトか（isUserProject）と共通か（isCommonProject）。コア・画面・スマホでここを使う（ずれると、ある画面にだけ出る・漏れる）

/** Kickoff が用意するプロジェクトの種類（common = 共通。共通のチャットと共通のノートの持ち主で、1 つだけ） */
const PROJECT_KINDS = ["common"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

/** 共通の呼び名（画面の札・AI への文。共通のプロジェクトの name もこれで作る） */
export const COMMON_PROJECT_LABEL = "共通";

/** 共通のチャットが動く作業フォルダ（.common-work）の呼び名 */
export const COMMON_WORKDIR_LABEL = "共通の作業フォルダ";

/**
 * 利用者が作ったプロジェクトか（種類なし）。名前・フォルダ・アーカイブ・並び・ゴミ箱・Git など利用者が持ち主の操作、
 * 「プロジェクトがない」の判定、PR の見張り・ポートのように Git やコードのフォルダが前提の所はこちらで絞る
 */
export const isUserProject = (project: { kind: ProjectKind | null }): boolean => project.kind === null;

/** 共通（共通のチャットと共通のノートの持ち主）か。一覧ではいつも先頭に置き、並べ替え・固定・アーカイブの外にする */
export const isCommonProject = (project: { kind: ProjectKind | null }): boolean => project.kind === "common";

/** アーカイブしていないか（利用者に見せる一覧・Dock の数は、共通も含めてこれで絞る） */
export const isActiveProject = (project: { archived_at: string | null }): boolean => project.archived_at === null;

/** 利用者が作ったプロジェクトのうち、アーカイブしていないものか */
export const isActiveUserProject = (project: { kind: ProjectKind | null; archived_at: string | null }): boolean => isActiveProject(project) && isUserProject(project);

/** projects の中で、id のプロジェクトが共通か（一覧にない ID は共通でないとみなす。一覧が届く前の画面・スマホも同じ） */
export const isCommonProjectIn = (projects: readonly { id: number; kind: ProjectKind | null }[], id: number): boolean => projects.some((p) => p.id === id && isCommonProject(p));

/** 利用者が作ったプロジェクトが 1 つでもあるか（共通は数えない。アーカイブしたものは数える。ないときは「プロジェクトを作る」の案内を出す） */
export const hasUserProjects = (projects: readonly { kind: ProjectKind | null }[]): boolean => projects.some(isUserProject);

/** 「〜で使う」などの持ち主の呼び名（共通なら「共通」、利用者のプロジェクトなら「このプロジェクト」） */
export const projectOwnerLabel = (common: boolean): string => (common ? COMMON_PROJECT_LABEL : "このプロジェクト");
