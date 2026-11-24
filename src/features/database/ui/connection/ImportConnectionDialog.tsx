import "./ImportConnectionDialog.css";
import { useEffect, useEffectEvent, useState, type FormEvent } from "react";
import { DB_ENGINE_LABELS, DB_ENVIRONMENT_LABELS, DB_ENVIRONMENTS, DB_IMPORT_SOURCE_LABELS, type DbConnection, type DbEnvironment, type DbImportCandidate } from "@shared/database/types";
import { dbApi } from "@/features/database/ui/api";
import { errorText, useQuery } from "@/foundation/ui/query";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { useModalDialog } from "@/foundation/ui/hooks/useModalDialog";
import { cx } from "@/foundation/ui/lib/cx";
import { applyConnection } from "@/features/database/ui/state/connectionsStore";
import { DialogActions } from "@/foundation/ui/kit/DialogActions";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { connectionScope } from "@/features/database/ui/dbFormat";
import { withPreselect } from "./importPreselect";

/** 案ごとの選び（取り込むか・名前・環境） */
interface ImportChoice {
  on: boolean;
  name: string;
  environment: DbEnvironment;
}

/**
 * プロジェクトから接続を取り込むダイアログ: コアが .env の DATABASE_URL など・docker compose の DB のサービス・Prisma の設定・
 * SQLite のファイルから見つけた案を並べ、選んだものを名前と環境を直して作る（パスワードは画面に来ず、コアが見つけた所から読み直す）。
 * Docker タブの「DB で開く」からは、その DB の案（preselect）だけを選んだ形で開き、作ったらその接続を onImported に渡す
 */
export function ImportConnectionDialog({
  projectId,
  preselect,
  onImported,
  onClose,
}: {
  projectId: number;
  preselect?: DbImportCandidate | null;
  onImported?: (connection: DbConnection) => void;
  onClose: () => void;
}) {
  const { ref: dialogRef, ...dialog } = useModalDialog();
  const found = useQuery(["ImportConnectionDialog.found", projectId], () => dbApi("GET /api/projects/:projectId/db-connections/import", { params: { projectId } }), { keepPrevious: true });
  const [picks, setPicks] = useState<Record<string, ImportChoice>>({});
  const action = useAction<"submit">();
  const list = found.data && preselect ? withPreselect(found.data, preselect) : (found.data ?? []);

  // 届いたら、まだ登録していないもの（Docker タブからならその DB の案だけ）を選んだ形で始める
  const startPicks = useEffectEvent(() => {
    if (!found.data) return;
    setPicks(Object.fromEntries(list.map((c) => [c.key, { on: preselect ? c.key === preselect.key : c.existing_id === null, name: c.name, environment: c.environment }])));
  });
  useEffect(() => {
    startPicks();
  }, [list]);

  const update = (key: string, patch: Partial<ImportChoice>) => setPicks((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
  const chosen = list.filter((c) => picks[c.key]?.on && picks[c.key].name.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (chosen.length === 0) return;
    const items = chosen.map((c) => ({ key: c.key, name: picks[c.key].name.trim(), environment: picks[c.key].environment }));
    let created: DbConnection[] = [];
    const ok = await action.run("submit", async () => (created = await dbApi("POST /api/projects/:projectId/db-connections/import", { params: { projectId }, body: { items } })), { keepBusy: true });
    if (!ok) return;
    created.forEach(applyConnection);
    dialog.close();
    // 作った接続は選んだ順に返る
    const opened = preselect ? created[chosen.findIndex((c) => c.key === preselect.key)] : undefined;
    if (opened) onImported?.(opened);
  };

  return (
    <dialog ref={dialogRef} className="dialog floating app-dialog db-import-dialog" aria-label="プロジェクトから取り込む" onClose={onClose}>
      <form className="app-dialog-body" onSubmit={(e) => void submit(e)}>
        <h2 className="app-dialog-title">プロジェクトから取り込む</h2>
        <p className="muted small">.env の DATABASE_URL など・docker compose の DB のサービス・Prisma の設定・SQLite のファイルから見つけた接続です。パスワードはそのまま取り込みます（画面には出しません）。</p>
        {found.loading && <p className="muted small">探しています…</p>}
        <ErrorText message={errorText(found.error)} />
        {found.data && list.length === 0 && <p className="db-import-empty small">見つかりませんでした。「接続を追加」から登録してください。</p>}
        <div className="db-import-list">
          {list.map((c) => (
            <ImportRow key={c.key} candidate={c} pick={picks[c.key]} onChange={(patch) => update(c.key, patch)} />
          ))}
        </div>
        <ErrorText message={action.error} />
        <DialogActions
          onCancel={() => dialog.close()}
          submit={{ label: chosen.length > 0 ? `${chosen.length} 件を取り込む` : "取り込む", busyLabel: "取り込んでいます…", busy: action.busy === "submit", disabled: chosen.length === 0 }}
        />
      </form>
    </dialog>
  );
}

function ImportRow({ candidate: c, pick, onChange }: { candidate: DbImportCandidate; pick: ImportChoice | undefined; onChange: (patch: Partial<ImportChoice>) => void }) {
  if (!pick) return null;
  const registered = c.existing_id !== null;
  return (
    <div className={cx("db-import-row", !pick.on && "off")}>
      <input type="checkbox" checked={pick.on} onChange={(e) => onChange({ on: e.target.checked })} aria-label={`${c.name} を取り込む`} />
      <div className="db-import-main">
        <div className="db-import-fields">
          <input type="text" value={pick.name} onChange={(e) => onChange({ name: e.target.value })} aria-label="接続の名前" disabled={!pick.on} />
          <select value={pick.environment} onChange={(e) => onChange({ environment: e.target.value as DbEnvironment })} aria-label="環境" disabled={!pick.on}>
            {DB_ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>
                {DB_ENVIRONMENT_LABELS[env]}
              </option>
            ))}
          </select>
        </div>
        <div className="db-import-meta small muted">
          <span className="db-import-source">{DB_IMPORT_SOURCE_LABELS[c.source]}</span>
          <span>{c.origin}</span>
          <span>
            {DB_ENGINE_LABELS[c.engine]} · {connectionScope(c)}
          </span>
          {c.has_password && <span>パスワードあり</span>}
          {registered && <span className="db-import-registered">登録済み</span>}
        </div>
        {c.note && <p className="db-import-note small">{c.note}</p>}
      </div>
    </div>
  );
}
