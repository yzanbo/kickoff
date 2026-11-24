import type { DatabaseSync } from "node:sqlite";

/** チャットの名前をまとめて引く（ゴミ箱のチャットも。もうないチャットは入れない。ゴミ箱の「消したチャット」の名前） */
export function chatTitlesOf(db: Pick<DatabaseSync, "prepare">) {
  return (ids: readonly number[]): Map<number, string> => {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = db.prepare(`SELECT id, title FROM chats WHERE id IN (${unique.map(() => "?").join(", ")})`).all(...unique) as { id: number; title: string }[];
    return new Map(rows.map((r) => [r.id, r.title]));
  };
}
