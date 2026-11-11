import { DB_ENVIRONMENT_DEFAULTS, type DbAiAccess, type DbConnection, type DbEngine, type DbEnvironment, type DbSslMode, type NewDbConnectionBody } from "@shared/types";

// 接続の登録・編集のダイアログ（ConnectionDialog）の入力欄の値と、送る形への直し方

/** 入力欄の値（数・null も文字で持つ。送るときに直す） */
export interface ConnectionForm {
  name: string;
  engine: DbEngine;
  environment: DbEnvironment;
  host: string;
  port: string;
  database: string;
  username: string;
  file_path: string;
  ssl: DbSslMode;
  ca_path: string;
  read_only: boolean;
  ai_access: DbAiAccess;
  password: string;
  /** 保存したパスワードを消す（編集のときだけ） */
  clearPassword: boolean;
  /** AI が SQL を流すときに使うユーザー（空ならふつうのユーザー） */
  ai_username: string;
  ai_password: string;
  clearAiPassword: boolean;
  /** 手順メモ（メモのフォルダからの相対パス。空ならなし） */
  memo_path: string;
  /** SSH トンネルを通す（踏み台・ホスト・ユーザー・鍵。空ならなし = ~/.ssh/config と ssh の既定） */
  ssh_on: boolean;
  ssh_host: string;
  ssh_port: string;
  ssh_user: string;
  ssh_identity_file: string;
  ssh_password: string;
  clearSshPassword: boolean;
}

export const formOf = (c: DbConnection | null): ConnectionForm => ({
  name: c?.name ?? "",
  engine: c?.engine ?? "sqlite",
  environment: c?.environment ?? "local",
  host: c?.host ?? "",
  port: c?.port ? String(c.port) : "",
  database: c?.database ?? "",
  username: c?.username ?? "",
  file_path: c?.file_path ?? "",
  ssl: c?.ssl?.mode ?? "off",
  ca_path: c?.ssl?.ca_path ?? "",
  read_only: c?.read_only ?? DB_ENVIRONMENT_DEFAULTS.local.read_only,
  ai_access: c?.ai_access ?? DB_ENVIRONMENT_DEFAULTS.local.ai_access,
  password: "",
  clearPassword: false,
  ai_username: c?.ai_username ?? "",
  ai_password: "",
  clearAiPassword: false,
  memo_path: c?.memo_path ?? "",
  ssh_on: c?.ssh != null,
  ssh_host: c?.ssh?.host ?? "",
  ssh_port: c?.ssh?.port ? String(c.ssh.port) : "",
  ssh_user: c?.ssh?.user ?? "",
  ssh_identity_file: c?.ssh?.identity_file ?? "",
  ssh_password: "",
  clearSshPassword: false,
});

/** 送る形（使わない欄は null。パスワードは書いたときだけ・消すなら null・省けばそのまま） */
export function bodyOf(form: ConnectionForm, editing: boolean): NewDbConnectionBody {
  const sqlite = form.engine === "sqlite";
  const text = (v: string) => v.trim() || null;
  const password = form.clearPassword ? null : form.password ? form.password : editing ? undefined : null;
  const aiPassword = form.clearAiPassword ? null : form.ai_password ? form.ai_password : editing ? undefined : null;
  const ssh = !sqlite && form.ssh_on && form.ssh_host.trim();
  const sshPassword = !ssh || form.clearSshPassword ? null : form.ssh_password ? form.ssh_password : editing ? undefined : null;
  return {
    name: form.name.trim(),
    engine: form.engine,
    environment: form.environment,
    host: sqlite ? null : text(form.host),
    port: sqlite || !form.port.trim() ? null : Number(form.port),
    database: sqlite ? null : text(form.database),
    username: sqlite ? null : text(form.username),
    file_path: sqlite ? text(form.file_path) : null,
    ssl: sqlite || form.ssl === "off" ? null : { mode: form.ssl, ca_path: text(form.ca_path) },
    read_only: form.read_only,
    ai_access: form.ai_access,
    ...(sqlite || password === undefined ? {} : { password }),
    ai_username: sqlite ? null : text(form.ai_username),
    ...(sqlite || aiPassword === undefined ? {} : { ai_password: aiPassword }),
    memo_path: text(form.memo_path),
    ssh: ssh
      ? { host: form.ssh_host.trim(), port: form.ssh_port.trim() ? Number(form.ssh_port) : null, user: text(form.ssh_user), identity_file: text(form.ssh_identity_file) }
      : null,
    ...(sshPassword === undefined ? {} : { ssh_password: sshPassword }),
  };
}
