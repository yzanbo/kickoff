// プロジェクトの種類。利用者が作るふつうのプロジェクトは種類なし（null）で、種類のあるものは Kickoff が用意する見えないプロジェクト。
// 一覧から外すかの判定はコア・画面・スマホでここの 1 つを使う（ずれると、ある画面にだけ見えないプロジェクトが出る）

/** 見えないプロジェクトの種類（common = 共通のノートの置き場。ノートのフォルダと作業場所を持つだけで、利用者には一覧に出さない） */
const PROJECT_KINDS = ["common"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

/**
 * 利用者に見せる一覧（サイドバー・切り替え・⌘K・ボード・スマホ・PR の見張り・ポートなど）に並べるプロジェクトか。
 * 見えないプロジェクトも API と画面の店には入っている（チャットの画面が店から引くため）ので、並べる所でこれを通す
 */
export const isListedProject = (project: { kind: ProjectKind | null }): boolean => project.kind === null;

/** 一覧に出すプロジェクトのうち、アーカイブしていないものか */
export const isActiveListedProject = (project: { kind: ProjectKind | null; archived_at: string | null }): boolean =>
  project.archived_at === null && isListedProject(project);
