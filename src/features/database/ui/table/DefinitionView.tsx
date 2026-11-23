import type { DbConnection } from "@shared/database/types";
import { dbApi, dbAt } from "@/features/database/ui/api";
import { errorText, useQuery } from "@/foundation/ui/query";
import type { DbTableTab } from "@/features/database/ui/state/dbClientTabs";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { RefreshButton } from "@/foundation/ui/kit/IconButton";
import { useDbClient } from "@/features/database/ui/state/dbClientContext";
import { objectPathLabel } from "@/features/database/ui/dbFormat";
import { DbDdlBlock, DbInfoTable, DbViewHead } from "./DbDetailParts";

/** 関数・列挙型のタブ（木から開く）。上に引数・戻り値・値・説明、下に作る文 */
export function DefinitionView({ tab, connection }: { tab: DbTableTab & { object: "function" | "enum" }; connection: DbConnection }) {
  const client = useDbClient();
  const worktree = client.worktreeOf(connection.id);
  const def = useQuery(["DefinitionView.def", connection.id, tab.key, worktree], () => dbApi("POST /api/projects/:projectId/db-connections/:connectionId/definition", { ...dbAt(client.projectId, connection.id, worktree), body: { path: tab.path, kind: tab.object, name: tab.name } }), { keepPrevious: true });
  const label = objectPathLabel(tab.path, tab.name);
  const d = def.data;
  const rows: [string, string][] = d
    ? [
        ...(d.kind === "function" ? ([["引数", d.arguments || "なし"], ["戻り値", d.returns ?? "なし（プロシージャ）"]] as [string, string][]) : []),
        ...(d.kind === "enum" ? ([["値", d.values.join(", ")]] as [string, string][]) : []),
        ["説明", d.comment ?? ""],
      ]
    : [];
  return (
    <div className="db-table-view">
      <DbViewHead label={label} kind={tab.object}>
        <span className="db-sql-spacer" />
        <RefreshButton label="取り直す" busy={def.loading} onClick={def.reload} />
      </DbViewHead>
      <ErrorText message={errorText(def.error)} />
      {d && (
        <div className="db-detail">
          <DbInfoTable rows={rows} />
          <DbDdlBlock className="db-definition-ddl" ddl={d.ddl} missing="この DB からは作る文を読めませんでした（権限がないなど）" />
        </div>
      )}
    </div>
  );
}
