import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "@shared/errors";
import { DB_ENGINE_LABELS, DB_ENVIRONMENT_LABELS, DB_ENVIRONMENTS, DB_IMPORT_SOURCE_LABELS, type DbEnvironment, type DbImportCandidate } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useModalDialog } from "@/hooks/useModalDialog";
import { cx } from "@/lib/cx";
import { dbConnectionsStore } from "@/stores/dbConnections";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { connectionPlace } from "./dbFormat";

/** 案ごとの選び（取り込むか・名前・環境） */
interface ImportChoice {
  on: boolean;
  name: string;
  environment: DbEnvironment;
}

/**
 * プロジェクトから接続を取り込むダイアログ: コアが .env の DATABASE_URL など・docker compose の DB のサービス・Prisma の設定・
 * SQLite のファイルから見つけた案を並べ、選んだものを名前と環境を直して作る（パスワードは画面に来ず、コアが見つけた所から読み直す）
 */
export function ImportConnectionDialog({ projectId, onClose }: { projectId: number; onClose: () => void }) {
  const dialog = useModalDialog();
  const found = useAsync(() => api.dbImportCandidates(projectId), [projectId]);
  const [picks, setPicks] = useState<Record<string, ImportChoice>>({});
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const list = found.data ?? [];

  // 届いたら、まだ登録していないものを選んだ形で始める
  useEffect(() => {
    if (!found.data) return;
    setPicks(Object.fromEntries(found.data.map((c) => [c.key, { on: c.existing_id === null, name: c.name, environment: c.environment }])));
  }, [found.data]);

  const update = (key: string, patch: Partial<ImportChoice>) => setPicks((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
  const chosen = list.filter((c) => picks[c.key]?.on && picks[c.key].name.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (chosen.length === 0) return;
    setSaving(true);
    try {
      await api.importDbConnections(projectId, { items: chosen.map((c) => ({ key: c.key, name: picks[c.key].name.trim(), environment: picks[c.key].environment })) });
      dbConnectionsStore.invalidate(projectId);
      dialog.close();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog.ref} className="dialog app-dialog db-import-dialog" aria-label="プロジェクトから取り込む" onClose={onClose}>
      <form className="app-dialog-body" onSubmit={(e) => void submit(e)}>
        <h2 className="app-dialog-title">プロジェクトから取り込む</h2>
        <p className="muted small">.env の DATABASE_URL など・docker compose の DB のサービス・Prisma の設定・SQLite のファイルから見つけた接続です。パスワードはそのまま取り込みます（画面には出しません）。</p>
        {found.loading && <p className="muted small">探しています…</p>}
        <ErrorText message={found.error} />
        {found.data && list.length === 0 && <p className="db-import-empty small">見つかりませんでした。「接続を追加」から登録してください。</p>}
        <div className="db-import-list">
          {list.map((c) => (
            <ImportRow key={c.key} candidate={c} pick={picks[c.key]} onChange={(patch) => update(c.key, patch)} />
          ))}
        </div>
        <ErrorText message={error} />
        <DialogActions
          onCancel={() => dialog.close()}
          submit={{ label: chosen.length > 0 ? `${chosen.length} 件を取り込む` : "取り込む", busyLabel: "取り込んでいます…", busy: saving, disabled: chosen.length === 0 }}
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
            {DB_ENGINE_LABELS[c.engine]} · {connectionPlace(c)}
          </span>
          {c.has_password && <span>パスワードあり</span>}
          {registered && <span className="db-import-registered">登録済み</span>}
        </div>
        {c.note && <p className="db-import-note small">{c.note}</p>}
      </div>
    </div>
  );
}
