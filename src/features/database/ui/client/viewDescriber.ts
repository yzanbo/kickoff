// AI の get_user_view に返す DB クライアントの説明（土台の viewDescribers に出す）: 前に出しているタブの接続とテーブル
import type { ViewDescriber } from "@/foundation/ui/shell/viewDescribers";
import { readSetting } from "@/foundation/ui/storage";
import { dbConnectionsStore } from "@/features/database/ui/state/connectionsStore";
import { storage } from "@/features/database/ui/storage";

export const databaseDescriber: ViewDescriber = {
  view: "db",
  describe: ({ projectId, surface }) => {
    const state = readSetting(storage.settings.tabs(surface));
    const active = state.tabs.find((t) => t.key === state.active) ?? null;
    const connection = active ? (dbConnectionsStore.get(projectId).data?.find((c) => c.id === active.connection_id)?.name ?? `接続 ${active.connection_id}`) : null;
    return { kind: "database", connection, table: active?.kind === "table" ? active.name : null, project_id: projectId };
  },
};
