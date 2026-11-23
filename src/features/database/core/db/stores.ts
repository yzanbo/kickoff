import type { DatabaseSync } from "node:sqlite";
import type { Notify } from "@/foundation/core/db/common";
import type { SecretStore } from "@/foundation/core/settings/secretStore";
import type { DbSecretKey } from "@/features/database/core/secretKeys";
import { createDbConnectionStore } from "./dbConnections";
import { createDbErLayoutStore } from "./dbErLayouts";
import { createDbPrepRunStore } from "./dbPrepRuns";
import { createDbQueryHistoryStore } from "./dbQueryHistory";

/** DB クライアントの表の店（接続・SQL の履歴・ER 図の位置・準備の記録）。titlesOf は履歴にチャットの名前を添える（chat の口） */
export function createDatabaseStores(db: DatabaseSync, onChange: Notify, secrets: SecretStore<DbSecretKey>, titlesOf: (ids: readonly number[]) => Map<number, string>) {
  return {
    dbConnections: createDbConnectionStore(db, onChange, secrets),
    dbQueryHistory: createDbQueryHistoryStore(db, titlesOf),
    dbErLayouts: createDbErLayoutStore(db),
    dbPrepRuns: createDbPrepRunStore(db),
  };
}

export type DatabaseStores = ReturnType<typeof createDatabaseStores>;
