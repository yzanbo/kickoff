import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "@shared/foundation/errors";
import type { DbConnection } from "@shared/database/types";
import type { DbEnteredPasswordsBody } from "@shared/database/api";
import { useCell } from "@/foundation/ui/store";
import { dbApi, dbOne } from "@/features/database/ui/api";
import { attachDbPasswordHost, dbPasswordQueue, finishDbPassword, type DbPasswordRequest } from "./askDbPassword";
import { useModalDialog } from "@/foundation/ui/hooks/useModalDialog";
import { useDbConnections } from "@/features/database/ui/state/connectionsStore";
import { DialogActions } from "@/foundation/ui/kit/DialogActions";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { Field } from "@/foundation/ui/kit/Field";

/** 入れてもらうパスワード（保存してある種類だけ。AI 用は AI のツールでだけ使うので省ける） */
const FIELDS: { key: keyof DbEnteredPasswordsBody; label: string; help?: string; has: (c: DbConnection) => boolean; optional?: boolean }[] = [
  { key: "password", label: "パスワード", has: (c) => c.has_password },
  { key: "ssh_password", label: "SSH のパスワード", has: (c) => c.has_ssh_password },
  { key: "ai_password", label: "AI 用のユーザーのパスワード", help: "AI のツールで使います（空のままでもつなげます）", has: (c) => c.has_ai_password, optional: true },
];

/**
 * 保存した DB のパスワードをキーチェーンで開けなかった（利用者が拒否した）ときに、その場でパスワードを聞くダイアログ（画面の真ん中）。
 * App と別ウィンドウに 1 つずつ置く。DB の API（ui/api.ts）が 409 の db_password_locked を受けたら askDbPassword の順番待ちに入り、
 * 接続ごとに 1 つだけ出し（同時に失敗した頼みは答えを待ってから、入れてもらえたらやり直す）、いくつもの接続ならひとつずつ聞く
 */
export function DbUnlockHost() {
  const current = useCell(dbPasswordQueue, (q) => q[0]);
  useEffect(attachDbPasswordHost, []);
  if (!current) return null;
  return <UnlockDialog key={`${current.projectId}:${current.connectionId}`} request={current} onFinish={finishDbPassword} />;
}

function UnlockDialog({ request, onFinish }: { request: DbPasswordRequest; onFinish: (entered: boolean) => void }) {
  const { ref: dialogRef, ...dialog } = useModalDialog({ closeOnBackdrop: false });
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
      await dbApi("POST /api/projects/:projectId/db-connections/:connectionId/entered-passwords", { ...dbOne(request.projectId, request.connectionId), body });
      setEntered(true);
      dialog.close();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="dialog floating app-dialog db-unlock-dialog" aria-label="DB のパスワード" onClose={() => onFinish(entered)}>
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
