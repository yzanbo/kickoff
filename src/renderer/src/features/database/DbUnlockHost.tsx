import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "@shared/errors";
import type { DbConnection, DbEnteredPasswordsBody } from "@shared/types";
import { api } from "@/api";
import { setDbUnlock } from "@/api/databases";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useDbConnections } from "@/stores/dbConnections";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { Field } from "@/ui/Field";

/** 聞いている接続（同じ接続への頼みは、答えが出るまで 1 つの問いを待つ） */
interface UnlockRequest {
  projectId: number;
  connectionId: number;
  resolve: (entered: boolean) => void;
}

/** 入れてもらうパスワード（保存してある種類だけ。AI 用は AI のツールでだけ使うので省ける） */
const FIELDS: { key: keyof DbEnteredPasswordsBody; label: string; help?: string; has: (c: DbConnection) => boolean; optional?: boolean }[] = [
  { key: "password", label: "パスワード", has: (c) => c.has_password },
  { key: "ssh_password", label: "SSH のパスワード", has: (c) => c.has_ssh_password },
  { key: "ai_password", label: "AI 用のユーザーのパスワード", help: "AI のツールで使います（空のままでもつなげます）", has: (c) => c.has_ai_password, optional: true },
];

/**
 * 保存した DB のパスワードをキーチェーンで開けなかった（利用者が拒否した）ときに、その場でパスワードを聞くダイアログ（画面の真ん中）。
 * App と別ウィンドウに 1 つずつ置く。DB の API（api/databases.ts の connecting）が 409 の db_password_locked を受けたら呼ばれ、
 * 接続ごとに 1 つだけ出し（同時に失敗した頼みは答えを待ってから、入れてもらえたらやり直す）、いくつもの接続ならひとつずつ聞く
 */
export function DbUnlockHost() {
  const [queue, setQueue] = useState<UnlockRequest[]>([]);

  useEffect(() => {
    const asking = new Map<number, Promise<boolean>>();
    setDbUnlock((projectId, connectionId) => {
      const known = asking.get(connectionId);
      if (known) return known;
      const answer = new Promise<boolean>((resolve) => setQueue((q) => [...q, { projectId, connectionId, resolve }]));
      asking.set(connectionId, answer);
      void answer.then(() => asking.delete(connectionId));
      return answer;
    });
    return () => setDbUnlock(null);
  }, []);

  const current = queue[0];
  if (!current) return null;
  const finish = (entered: boolean) => {
    current.resolve(entered);
    setQueue((q) => q.slice(1));
  };
  return <UnlockDialog key={`${current.projectId}:${current.connectionId}`} request={current} onFinish={finish} />;
}

function UnlockDialog({ request, onFinish }: { request: UnlockRequest; onFinish: (entered: boolean) => void }) {
  const dialog = useModalDialog({ closeOnBackdrop: false });
  const connections = useDbConnections(request.projectId);
  const connection = connections.data?.find((c) => c.id === request.connectionId);
  const fields = connection ? FIELDS.filter((f) => f.has(connection)) : [];
  const [values, setValues] = useState<DbEnteredPasswordsBody>({});
  const [entered, setEntered] = useState(false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const ready = fields.length > 0 && fields.every((f) => f.optional || values[f.key]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const body = Object.fromEntries(fields.filter((f) => values[f.key]).map((f) => [f.key, values[f.key]]));
      await api.enterDbPasswords(request.projectId, request.connectionId, body);
      setEntered(true);
      dialog.close();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog.ref} className="dialog app-dialog db-unlock-dialog" aria-label="DB のパスワード" onClose={() => onFinish(entered)}>
      <form className="app-dialog-body" onSubmit={(e) => void submit(e)}>
        <h2 className="app-dialog-title">{connection ? `「${connection.name}」に接続` : "DB に接続"}</h2>
        <p className="app-dialog-message">保存したパスワードを読めませんでした（キーチェーンで許可されませんでした）。</p>
        {connections.loading && !connection && <p className="muted small">読み込み中…</p>}
        {fields.map((f, i) => (
          <Field key={f.key} label={f.label} help={f.help}>
            <input
              type="password"
              autoFocus={i === 0}
              autoComplete="off"
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </Field>
        ))}
        <p className="muted small">
          入れたパスワードは Kickoff を終えるまで覚え、この接続のほかのタブと AI のツールでも使います（保存したパスワードは変えません）。Kickoff
          を起動し直すと、もう一度キーチェーンの許可を聞きます。
        </p>
        <ErrorText message={error} />
        <DialogActions onCancel={() => dialog.close()} cancelLabel="やめる" submit={{ label: "接続", busyLabel: "接続しています…", busy: saving, disabled: !ready }} />
      </form>
    </dialog>
  );
}
