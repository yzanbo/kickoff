// プロジェクトの種類。利用者が作るふつうのプロジェクトは種類なし（null）で、種類のあるものは Kickoff が用意するプロジェクト。
// 判定は 2 つ: 利用者が作ったプロジェクトか（isUserProject）と、一覧に並べるか（isListedProject）。コア・画面・スマホでここを使う（ずれると、ある画面にだけ出る・漏れる）

/** Kickoff が用意するプロジェクトの種類（common = 共通。共通のチャットと共通のノートの持ち主で、1 つだけ） */
const PROJECT_KINDS = ["common"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

/**
 * 利用者が作ったプロジェクトか（種類なし）。名前・フォルダ・アーカイブ・並び・ゴミ箱・Git など利用者が持ち主の操作、
 * 「プロジェクトがない」の判定、PR の見張り・ポートのように Git やコードのフォルダが前提の所はこちらで絞る
 */
export const isUserProject = (project: { kind: ProjectKind | null }): boolean => project.kind === null;

/** 共通（共通のチャットと共通のノートの持ち主）か。一覧ではいつも先頭に置き、並べ替え・固定・アーカイブの外にする */
export const isCommonProject = (project: { kind: ProjectKind | null }): boolean => project.kind === "common";

/** 利用者が作ったプロジェクトのうち、アーカイブしていないものか */
export const isActiveUserProject = (project: { kind: ProjectKind | null; archived_at: string | null }): boolean => project.archived_at === null && isUserProject(project);

/**
 * 利用者に見せる一覧（サイドバー・切り替え・⌘K・ボード・数・スマホなど）に並べるプロジェクトか。共通も並べる（どこに並べるかは画面が決める）。
 * いまある種類はどれも並べるので、いつも true（並べない種類を足したら、ここで外す）
 */
export const isListedProject = (project: { kind: ProjectKind | null }): boolean => project.kind === null || project.kind === "common";

/** 一覧に出すプロジェクトのうち、アーカイブしていないものか */
export const isActiveListedProject = (project: { kind: ProjectKind | null; archived_at: string | null }): boolean =>
  project.archived_at === null && isListedProject(project);
