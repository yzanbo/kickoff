import { useState, type FormEvent } from "react";
import { errorMessage } from "@shared/errors";
import { DB_ENGINE_LABELS, DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useModalDialog } from "@/hooks/useModalDialog";
import { dbConnectionsStore } from "@/stores/dbConnections";
import { useProjects } from "@/stores/projects";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { CheckField } from "@/ui/Field";
import { connectionPlace } from "./dbFormat";

/**
 * ほかのプロジェクトの DB の接続を、このプロジェクトに写すダイアログ（接続はプロジェクトごとなので、同じ DB を使うときに写す）。
 * パスワードは「パスワードも写す」を選んだときだけ（初めはオフ）
 */
export function CopyConnectionDialog({ projectId, onClose }: { projectId: number; onClose: () => void }) {
  const dialog = useModalDialog();
  const { projects } = useProjects();
  const others = projects.filter((p) => p.id !== projectId && !p.archived_at);
  const lists = useAsync(
    () => Promise.all(others.map(async (p) => ({ project: p, connections: await api.dbConnections(p.id).catch(() => [] as DbConnection[]) }))),
    [others.map((p) => p.id).join(",")],
  );
  const [picked, setPicked] = useState<number | null>(null);
  const [withPassword, setWithPassword] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const groups = (lists.data ?? []).filter((g) => g.connections.length > 0);
  const pickedConnection = groups.flatMap((g) => g.connections).find((c) => c.id === picked);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (picked === null) return;
    setSaving(true);
    try {
      await api.copyDbConnection(projectId, { from_id: picked, copy_password: withPassword });
      dbConnectionsStore.invalidate(projectId);
      dialog.close();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog.ref} className="dialog app-dialog db-copy-dialog" aria-label="ほかのプロジェクトの接続を写す" onClose={onClose}>
      <form className="app-dialog-body" onSubmit={(e) => void submit(e)}>
        <h2 className="app-dialog-title">ほかのプロジェクトの接続を写す</h2>
        {lists.loading && <p className="muted small">読み込み中…</p>}
        {!lists.loading && groups.length === 0 && <p className="muted small">ほかのプロジェクトに DB の接続がありません。</p>}
        <div className="db-copy-list">
          {groups.map((g) => (
            <fieldset key={g.project.id} className="db-copy-group">
              <legend>{g.project.name}</legend>
              {g.connections.map((c) => (
                <label key={c.id} className="db-copy-row">
                  <input type="radio" name="db-copy" checked={picked === c.id} onChange={() => setPicked(c.id)} />
                  <span className="db-copy-name">{c.name}</span>
                  <span className="muted small">
                    {DB_ENGINE_LABELS[c.engine]} · {DB_ENVIRONMENT_LABELS[c.environment]} · {connectionPlace(c)}
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <CheckField
          label="パスワードも写す"
          help={pickedConnection && !pickedConnection.has_password ? "この接続にはパスワードが保存されていません" : "写さなければ、写したあとに入れ直します"}
          checked={withPassword}
          disabled={!pickedConnection?.has_password}
          onChange={setWithPassword}
        />
        <ErrorText message={error} />
        <DialogActions onCancel={() => dialog.close()} submit={{ label: "写す", busyLabel: "写しています…", busy: saving, disabled: picked === null }} />
      </form>
    </dialog>
  );
}
