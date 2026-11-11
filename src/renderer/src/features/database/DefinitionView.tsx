import { DB_OBJECT_KIND_LABELS, type DbConnection } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import type { DbTableTab } from "@/lib/dbClientTabs";
import { CopyButton } from "@/ui/CopyButton";
import { ErrorText } from "@/ui/ErrorText";
import { HighlightedCode } from "@/ui/HighlightedCode";
import { RefreshButton } from "@/ui/IconButton";
import { useDbClient } from "./dbClientContext";
import { objectPathLabel } from "./dbFormat";

/** 関数・列挙型のタブ（木から開く）。上に引数・戻り値・値・説明、下に作る文 */
export function DefinitionView({ tab, connection }: { tab: DbTableTab & { object: "function" | "enum" }; connection: DbConnection }) {
  const client = useDbClient();
  const worktree = client.worktreeOf(connection.id);
  const def = useAsync(() => api.dbDefinition(client.projectId, connection.id, tab.path, tab.object, tab.name, worktree), [connection.id, tab.key, worktree]);
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
      <div className="db-view-head">
        <span className="db-view-title" title={label}>
          {label}
        </span>
        <span className="db-view-kind">{DB_OBJECT_KIND_LABELS[tab.object]}</span>
        <span className="db-sql-spacer" />
        <RefreshButton label="取り直す" busy={def.loading} onClick={def.reload} />
      </div>
      <ErrorText message={def.error} />
      {d && (
        <div className="db-detail">
          <table className="db-detail-table db-info-table">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <th>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="db-definition-ddl">
            {d.ddl ? (
              <>
                <CopyButton label="DDL をコピー" text={d.ddl} className="db-ddl-copy" />
                <pre>
                  <HighlightedCode code={d.ddl} lang="sql" />
                </pre>
              </>
            ) : (
              <p className="muted small">この DB からは作る文を読めませんでした（権限がないなど）</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
