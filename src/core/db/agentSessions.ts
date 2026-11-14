import type { DatabaseSync } from "node:sqlite";
import type { ProviderId } from "@shared/types";

/** Kickoff が作ったセッションの覚え（表 agent_sessions。v28） */
export interface AgentSessionRow {
  session_id: string;
  provider: ProviderId;
  project_id: number | null;
  cwd: string;
  created_at: string;
}

/**
 * チャットの session_id に入れたセッションを覚える（チャットの店が書くたびに呼ぶ。もう覚えていれば何もしない）。
 * 作業フォルダはチャットの作業場所（ワークツリー）か、なければプロジェクトのフォルダ
 */
export function rememberChatSession(db: DatabaseSync, chatId: number, sessionId: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO agent_sessions (session_id, provider, project_id, cwd)
     SELECT ?, c.provider, c.project_id, COALESCE(c.worktree_path, p.repo_path) FROM chats c JOIN projects p ON p.id = c.project_id WHERE c.id = ?`,
  ).run(sessionId, chatId);
}

/**
 * Kickoff が作ったセッション（メモの仕様書「ファイル削除」の Q17）。どのチャットからも使われなくなったものを、片付け（trash/sessionTrash.ts）が
 * 会話記録ごと Kickoff のゴミ箱へ入れて忘れる。知らせは出さない（画面には出さないため）
 */
export function createAgentSessionStore(db: DatabaseSync) {
  return {
    /** before より前に覚えたもの（作ったばかりで、まだ記録に書いていないものを除くため） */
    olderThan(before: string): AgentSessionRow[] {
      return db.prepare("SELECT * FROM agent_sessions WHERE created_at < ? ORDER BY created_at").all(before) as unknown as AgentSessionRow[];
    },
    has(sessionId: string): boolean {
      return Boolean(db.prepare("SELECT 1 FROM agent_sessions WHERE session_id = ?").get(sessionId));
    },
    forget(sessionId: string): void {
      db.prepare("DELETE FROM agent_sessions WHERE session_id = ?").run(sessionId);
    },
  };
}
