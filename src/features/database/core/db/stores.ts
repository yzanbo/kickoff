import type { DatabaseSync } from "node:sqlite";
import type { Notify } from "@/foundation/core/db/common";
import { createDbConnectionStore, type DbSecretKey } from "./dbConnections";
import { createDbErLayoutStore } from "./dbErLayouts";
import { createDbPrepRunStore } from "./dbPrepRuns";
import { createDbQueryHistoryStore } from "./dbQueryHistory";

/** 接続のパスワードを置く秘密の値（土台の secrets の店） */
interface DbSecrets {
  get(key: DbSecretKey): string | null;
  set(key: DbSecretKey, value: string): void;
}

/** DB クライアントの表の店（接続・SQL の履歴・ER 図の位置・準備の記録）。titlesOf は履歴にチャットの名前を添える（chat の口） */
export function createDatabaseStores(db: DatabaseSync, onChange: Notify, secrets: DbSecrets, titlesOf: (ids: readonly number[]) => Map<number, string>) {
  return {
    dbConnections: createDbConnectionStore(db, onChange, secrets),
    dbQueryHistory: createDbQueryHistoryStore(db, titlesOf),
    dbErLayouts: createDbErLayoutStore(db),
    dbPrepRuns: createDbPrepRunStore(db),
  };
}

export type DatabaseStores = ReturnType<typeof createDatabaseStores>;
