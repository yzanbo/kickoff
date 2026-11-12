import { normalizePrep } from "@shared/database/dbPrep";
import { DB_ENVIRONMENT_DEFAULTS, type DbAiAccess, type DbConnection, type DbWriteCheck, type DbEngine, type DbEnvironment, type DbPrep, type DbSslMode, type NewDbConnectionBody } from "@shared/types";

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
  write_check: DbWriteCheck;
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
  /** つなぐ前の準備のコマンドを使う（準備・後片付けは 1 行に 1 つ。外すと送らない） */
  prep_on: boolean;
  prep_prepare: string;
  prep_cleanup: string;
  prep_tunnel: string;
  prep_password: string;
  prep_my_ip_url: string;
  /** 次に確かめる日（YYYY-MM-DD）とひとこと */
  check_on: string;
  check_note: string;
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
  write_check: c?.write_check ?? DB_ENVIRONMENT_DEFAULTS.local.write_check,
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
  prep_on: c?.prep != null,
  prep_prepare: c?.prep?.prepare.join("\n") ?? "",
  prep_cleanup: c?.prep?.cleanup.join("\n") ?? "",
  prep_tunnel: c?.prep?.tunnel ?? "",
  prep_password: c?.prep?.password ?? "",
  prep_my_ip_url: c?.prep?.my_ip_url ?? "",
  check_on: c?.check_on ?? "",
  check_note: c?.check_note ?? "",
});

/** 準備の欄の値（空なら null。コアも空の行を落とす） */
export function prepOf(form: ConnectionForm): DbPrep | null {
  if (!form.prep_on) return null;
  return normalizePrep({
    prepare: form.prep_prepare.split("\n"),
    cleanup: form.prep_cleanup.split("\n"),
    // SQLite はつなぐ先がない。SSH トンネルとポートの転送は一緒に使えない
    tunnel: form.engine === "sqlite" || form.ssh_on ? null : form.prep_tunnel,
    password: form.engine === "sqlite" ? null : form.prep_password,
    my_ip_url: form.prep_my_ip_url,
  });
}

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
    write_check: form.write_check,
    ai_access: form.ai_access,
    ...(sqlite || password === undefined ? {} : { password }),
    ai_username: sqlite ? null : text(form.ai_username),
    ...(sqlite || aiPassword === undefined ? {} : { ai_password: aiPassword }),
    memo_path: text(form.memo_path),
    ssh: ssh
      ? { host: form.ssh_host.trim(), port: form.ssh_port.trim() ? Number(form.ssh_port) : null, user: text(form.ssh_user), identity_file: text(form.ssh_identity_file) }
      : null,
    ...(sshPassword === undefined ? {} : { ssh_password: sshPassword }),
    prep: prepOf(form),
    check_on: text(form.check_on),
    check_note: text(form.check_note),
  };
}
