// ほかの Kickoff（製品版から見た開発版・開発版から見た製品版）が使っているセッション（Claude Code の会話記録）を調べる。
// どちらの Kickoff も同じ ~/.claude/projects に会話記録を置き、開発版のデータは製品版から写して作る（同じチャットが同じセッションを指す）ので、
// 片方で使わなくなった会話記録を消すと、もう片方のチャットの会話が続かなくなる。消す前にほかの Kickoff の DB を読むだけで開いて確かめる
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { appDataDir } from "../system/appEnv.js";
import { realPathLoose } from "../system/paths.js";
import { DB_FILE } from "../db/open.js";

/** ids のうち、ほかの Kickoff のチャットが使っているもの（チャットの session_id か、記録の init・result）。読めない DB は飛ばす */
export type SessionsUsedElsewhere = (ids: string[]) => Set<string>;

/** 自分の保存先（dataDir）でない製品版・開発版の保存先の DB を調べる口を作る */
export function siblingSessionCheck(dataDir: string, appDataRoot: string): SessionsUsedElsewhere {
  const self = realPathLoose(dataDir);
  const others = [appDataDir(appDataRoot, "production"), appDataDir(appDataRoot, "development")].filter((dir) => realPathLoose(dir) !== self);
  return (ids) => {
    const used = new Set<string>();
    if (ids.length === 0) return used;
    for (const dir of others) {
      const file = path.join(dir, DB_FILE);
      if (!fs.existsSync(file)) continue;
      for (const id of usedIn(file, ids)) used.add(id);
    }
    return used;
  };
}

/** 1 つの DB で使われている ID（読むだけで開く。開けない・表がない版なら空） */
function usedIn(file: string, ids: string[]): string[] {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const marks = ids.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT session_id AS sid FROM chats WHERE session_id IN (${marks})
         UNION SELECT json_extract(data, '$.session_id') FROM chat_events
         WHERE type IN ('init', 'result') AND json_extract(data, '$.session_id') IN (${marks})`,
      )
      .all(...ids, ...ids) as { sid: string }[];
    return rows.map((r) => r.sid);
  } catch {
    return [];
  } finally {
    db?.close();
  }
}
