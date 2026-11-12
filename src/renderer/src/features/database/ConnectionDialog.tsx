import { useState, type FormEvent } from "react";
import { errorMessage } from "@shared/errors";
import { parseDbUrl } from "@shared/database/dbUrl";
import {
  DB_AI_ACCESSES,
  DB_AI_ACCESS_LABELS,
  DB_DEFAULT_PORTS,
  DB_ENGINES,
  DB_ENGINE_LABELS,
  DB_ENVIRONMENTS,
  DB_ENVIRONMENT_DEFAULTS,
  DB_ENVIRONMENT_LABELS,
  DB_SSL_MODES,
  DB_SSL_MODE_LABELS,
  DB_SSH_UNKNOWN_HOST,
  DB_WRITE_CHECKS,
  DB_WRITE_CHECK_LABELS,
  type DbAiAccess,
  type DbConnection,
  type DbConnectionTestResult,
  type DbEngine,
  type DbEnvironment,
  type DbSsh,
  type DbSslMode,
  type DbWriteCheck,
} from "@shared/types";
import { api } from "@/api";
import { useModalDialog } from "@/hooks/useModalDialog";
import { dbConnectionsStore } from "@/stores/dbConnections";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { CheckField, Field } from "@/ui/Field";
import { Segmented } from "@/ui/Segmented";
import { bodyOf, formOf, type ConnectionForm } from "./connectionForm";
import { ConnectionMemoField } from "./ConnectionMemoField";
import { ConnectionPrepFields } from "./ConnectionPrepFields";
import { ConnectionSshFields } from "./ConnectionSshFields";
import { DbFailureHelp } from "./DbFailureDialog";
import { SshHostKeyDialog } from "./SshHostKeyDialog";

/**
 * DB の接続を登録・編集するダイアログ。URL を貼れば欄が埋まり、「つながるか試す」の結果をその場に出す。
 * 新しく作るときは、環境を選ぶと読み取り専用・AI に見せるかを環境の既定にそろえる（あとで変えられる）
 */
export function ConnectionDialog({
  projectId,
  connection,
  worktree,
  onClose,
}: {
  projectId: number;
  /** 編集する接続（null なら新しく作る） */
  connection: DbConnection | null;
  worktree: string | null;
  onClose: () => void;
}) {
  const dialog = useModalDialog({ closeOnBackdrop: false });
  const editing = connection !== null;
  const [form, setForm] = useState<ConnectionForm>(() => formOf(connection));
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string>();
  const [test, setTest] = useState<DbConnectionTestResult | "testing" | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  /** 鍵を確かめている踏み台（初めてのサーバーで試すのに失敗したとき） */
  const [hostKey, setHostKey] = useState<DbSsh | null>(null);
  const set = <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const sqlite = form.engine === "sqlite";

  const chooseEnvironment = (environment: DbEnvironment) =>
    setForm((f) => (editing ? { ...f, environment } : { ...f, environment, ...DB_ENVIRONMENT_DEFAULTS[environment] }));
  const chooseEngine = (engine: DbEngine) => setForm((f) => ({ ...f, engine, port: f.port || String(DB_DEFAULT_PORTS[engine] ?? "") }));

  const applyUrl = (text: string) => {
    setUrl(text);
    if (!text.trim()) return setUrlError(undefined);
    const parsed = parseDbUrl(text);
    if (!parsed) return setUrlError("読めない形です（postgres:// mysql:// sqlite: などで始まる URL を貼ってください）");
    setUrlError(undefined);
    setForm((f) => ({
      ...f,
      engine: parsed.engine,
      host: parsed.host ?? "",
      port: parsed.port ? String(parsed.port) : "",
      database: parsed.database ?? "",
      username: parsed.username ?? "",
      file_path: parsed.file_path ?? f.file_path,
      password: parsed.password ?? f.password,
      ssl: parsed.ssl?.mode ?? "off",
      ca_path: parsed.ssl?.ca_path ?? "",
      name: f.name || parsed.database || parsed.file_path?.split("/").pop() || parsed.host || "",
    }));
  };

  const runTest = async () => {
    setTest("testing");
    // 手順メモ・次に確かめる日はつながるかに関係しないので送らない
    const { memo_path: _memo, check_on: _on, check_note: _note, ...body } = bodyOf(form, editing);
    void [_memo, _on, _note];
    try {
      setTest(
        await api.testDbConnection(
          projectId,
          { ...body, ...(editing ? { connection_id: connection.id } : {}), password: form.clearPassword ? null : form.password || undefined },
          worktree,
        ),
      );
    } catch (e) {
      setTest({ ok: false, server_version: null, error: errorMessage(e) });
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      const body = bodyOf(form, editing);
      if (editing) await api.updateDbConnection(projectId, connection.id, body);
      else await api.createDbConnection(projectId, body);
      dbConnectionsStore.invalidate(projectId);
      dialog.close();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialog.ref} className="dialog app-dialog db-connection-dialog" aria-label={editing ? "DB の接続を編集" : "DB の接続を追加"} onClose={onClose}>
      <form className="app-dialog-body" onSubmit={(e) => void submit(e)}>
        <h2 className="app-dialog-title">{editing ? "DB の接続を編集" : "DB の接続を追加"}</h2>
        {!editing && (
          <Field label="接続の URL（貼ると下の欄が埋まります）" help={urlError ? <span className="error">{urlError}</span> : undefined}>
            <input value={url} onChange={(e) => applyUrl(e.target.value)} placeholder="postgres://user:pass@localhost:5432/app" spellCheck={false} />
          </Field>
        )}
        <Field label="名前">
          <input value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={100} placeholder="開発の DB" />
        </Field>
        <Field label="DB の種類" as="div">
          <Segmented
            className="segmented"
            label="DB の種類"
            value={form.engine}
            options={DB_ENGINES.map((v) => ({ value: v, label: DB_ENGINE_LABELS[v] }))}
            onChange={chooseEngine}
          />
        </Field>
        {sqlite ? (
          <Field label="ファイル" help="プロジェクトフォルダからの場所（外のファイルは / か ~ から）。ワークツリーでは、その中の同じ場所のファイルを開きます">
            <input value={form.file_path} onChange={(e) => set("file_path", e.target.value)} required placeholder="db/development.sqlite3" spellCheck={false} />
          </Field>
        ) : (
          <>
            <div className="db-connection-row">
              <Field label="ホスト">
                <input value={form.host} onChange={(e) => set("host", e.target.value)} required placeholder="localhost" spellCheck={false} />
              </Field>
              <Field label="ポート">
                <input value={form.port} onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={String(DB_DEFAULT_PORTS[form.engine] ?? "")} />
              </Field>
            </div>
            <div className="db-connection-row">
              <Field label="DB 名">
                <input value={form.database} onChange={(e) => set("database", e.target.value)} spellCheck={false} />
              </Field>
              <Field label="ユーザー">
                <input value={form.username} onChange={(e) => set("username", e.target.value)} spellCheck={false} autoComplete="off" />
              </Field>
            </div>
            <Field
              label="パスワード"
              help={connection?.has_password ? "保存してあります（変えるときだけ入力）。保存した値は画面・AI には出しません" : "この Mac の Kickoff の中だけに保存し、画面・AI には出しません"}
            >
              <input
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                disabled={form.clearPassword}
                autoComplete="new-password"
                placeholder={connection?.has_password ? "••••••••" : ""}
              />
            </Field>
            {connection?.has_password && <CheckField label="保存したパスワードを消す" checked={form.clearPassword} onChange={(v) => set("clearPassword", v)} />}
            <Field label="SSL">
              <select value={form.ssl} onChange={(e) => set("ssl", e.target.value as DbSslMode)}>
                {DB_SSL_MODES.map((m) => (
                  <option key={m} value={m}>
                    {DB_SSL_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
            {form.ssl === "verify" && (
              <Field label="CA の証明書（省けば OS の証明書で確かめます）">
                <input value={form.ca_path} onChange={(e) => set("ca_path", e.target.value)} placeholder="~/certs/ca.pem" spellCheck={false} />
              </Field>
            )}
            <ConnectionSshFields projectId={projectId} form={form} hasPassword={!!connection?.has_ssh_password} set={set} />
          </>
        )}
        <Field label="環境" as="div" help="環境ごとに色を付け、本番は初めから読み取り専用にします">
          <Segmented
            className="segmented db-environment-choice"
            label="環境"
            value={form.environment}
            options={DB_ENVIRONMENTS.map((v) => ({ value: v, label: DB_ENVIRONMENT_LABELS[v] }))}
            onChange={chooseEnvironment}
          />
        </Field>
        <CheckField
          label="読み取り専用"
          help="書き込む文を流す前に断り、DB 側でも読み取り専用でつなぎます。SQL のタブの「書き込む」の間だけ外せます"
          checked={form.read_only}
          onChange={(v) => set("read_only", v)}
        />
        {!form.read_only && (
          <Field
            label="書き込む前の確かめ"
            help="SQL のタブで流すとき・テーブルの変更を保存するときに確かめます。危険な文 = DROP・TRUNCATE・ALTER・WHERE のない UPDATE / DELETE・判定できない文"
          >
            <select value={form.write_check} onChange={(e) => set("write_check", e.target.value as DbWriteCheck)}>
              {DB_WRITE_CHECKS.map((v) => (
                <option key={v} value={v}>
                  {DB_WRITE_CHECK_LABELS[v]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field
          label="チャットの AI に見せるか"
          help="自由に見せる = AI が聞かずに読む / 承認して見せる = AI が SQL を流す前に聞く / 見せない = AI のツールに出さず、AI がコマンド・ファイルで直接つなぐのも断る（うっかりを防ぐもので、変数に分けるなどわざと避ける書き方までは見抜けません）。AI が流せるのは読み取りの 1 文だけ（100 行・30 秒まで）"
        >
          <select value={form.ai_access} onChange={(e) => set("ai_access", e.target.value as DbAiAccess)}>
            {DB_AI_ACCESSES.map((v) => (
              <option key={v} value={v}>
                {DB_AI_ACCESS_LABELS[v]}
              </option>
            ))}
          </select>
        </Field>
        {!sqlite && form.ai_access !== "none" && (
          <div className="db-connection-row">
            <Field label="AI 用のユーザー（任意）" help="AI が SQL を流すときだけ、このユーザーでつなぎます（読み取りの権限だけのユーザーを作っておくと、より安全です）">
              <input value={form.ai_username} onChange={(e) => set("ai_username", e.target.value)} spellCheck={false} autoComplete="off" />
            </Field>
            <Field label="AI 用のパスワード" help={connection?.has_ai_password ? "保存してあります（変えるときだけ入力）" : undefined}>
              <input
                type="password"
                value={form.ai_password}
                onChange={(e) => set("ai_password", e.target.value)}
                disabled={form.clearAiPassword || !form.ai_username.trim()}
                autoComplete="new-password"
                placeholder={connection?.has_ai_password ? "••••••••" : ""}
              />
            </Field>
          </div>
        )}
        {!sqlite && form.ai_access !== "none" && connection?.has_ai_password && (
          <CheckField label="保存した AI 用のパスワードを消す" checked={form.clearAiPassword} onChange={(v) => set("clearAiPassword", v)} />
        )}
        <ConnectionPrepFields form={form} set={set} />
        <ConnectionMemoField projectId={projectId} value={form.memo_path} onChange={(v) => set("memo_path", v)} />
        {test && test !== "testing" && (
          <p className={test.ok ? "db-test-result ok" : "db-test-result ng"}>{test.ok ? `つながりました（${test.server_version ?? "版は不明"}）` : `つながりません: ${test.error}`}</p>
        )}
        {test && test !== "testing" && !test.ok && test.code === DB_SSH_UNKNOWN_HOST && (
          <button type="button" className="btn btn-sm db-ssh-key-button" onClick={() => setHostKey(bodyOf(form, editing).ssh ?? null)}>
            サーバーの鍵を確かめる…
          </button>
        )}
        {test && test !== "testing" && !test.ok && test.error && test.code !== DB_SSH_UNKNOWN_HOST && <DbFailureHelp error={test.error} />}
        <ErrorText message={error} />
        <DialogActions onCancel={() => dialog.close()} submit={{ label: editing ? "保存" : "追加", busyLabel: "保存中…", busy: saving }}>
          <button type="button" className="btn" disabled={test === "testing"} onClick={() => void runTest()}>
            {test === "testing" ? "試しています…" : "つながるか試す"}
          </button>
        </DialogActions>
      </form>
      {hostKey && <SshHostKeyDialog projectId={projectId} ssh={hostKey} onAccepted={() => void runTest()} onClose={() => setHostKey(null)} />}
    </dialog>
  );
}
