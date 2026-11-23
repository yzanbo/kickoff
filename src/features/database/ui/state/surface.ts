// DB クライアントの置き場所（プロジェクトの DB タブ・チャットの右の欄と別ウィンドウ・右サイドバー）。開いているタブ・木の開き具合・書きかけの SQL はここごとに覚える
export type DbSurface = { kind: "project"; projectId: number } | { kind: "chat"; chatId: number } | { kind: "side"; projectId: number };

/** 保存のキーの族の名前（project-<プロジェクト> / chat-<チャット> / side-<プロジェクト>） */
export const dbSurfaceKey = (s: DbSurface): string => (s.kind === "chat" ? `chat-${s.chatId}` : `${s.kind}-${s.projectId}`);
