import { normalizePrep } from "@shared/database/dbPrep";
import { DB_ENVIRONMENT_DEFAULTS, type DbAiAccess, type DbConnection, type DbWriteCheck, type DbEngine, type DbEnvironment, type DbPrep, type DbSslMode } from "@shared/database/types";
import type { NewDbConnectionBody, DbConnectionTestResult } from "@shared/database/api";
import { isFileDb } from "@shared/database/connectionShape";

// 接続の登録・編集のダイアログ（ConnectionDialog）の入力欄の値と、送る形への直し方

/** SSH トンネルの欄（on: 通す） */
export interface SshForm {
  on: boolean;
  host: string;
  port: string;
  user: string;
  identity_file: string;
  password: string;
  clearPassword: boolean;
}

/** つなぐ前の準備の欄（on: 使う） */
export interface PrepForm {
  on: boolean;
  prepare: string;
  cleanup: string;
  tunnel: string;
  password: string;
  my_ip_url: string;
}

/** 入れ子の欄（ssh・prep）の 1 つを書き換える関数 */
export type SetPart<T> = <K extends keyof T>(key: K, value: T[K]) => void;

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
  /** 手順ノート（ノートのフォルダからの相対パス。空ならなし） */
  note_path: string;
  /** SSH トンネル（踏み台・ホスト・ユーザー・鍵。空ならなし = ~/.ssh/config と ssh の既定） */
  ssh: SshForm;
  /** つなぐ前の準備のコマンド（準備・後片付けは 1 行に 1 つ。外すと送らない） */
  prep: PrepForm;
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
  note_path: c?.note_path ?? "",
  ssh: {
    on: c?.ssh != null,
    host: c?.ssh?.host ?? "",
    port: c?.ssh?.port ? String(c.ssh.port) : "",
    user: c?.ssh?.user ?? "",
    identity_file: c?.ssh?.identity_file ?? "",
    password: "",
    clearPassword: false,
  },
  prep: {
    on: c?.prep != null,
    prepare: c?.prep?.prepare.join("\n") ?? "",
    cleanup: c?.prep?.cleanup.join("\n") ?? "",
    tunnel: c?.prep?.tunnel ?? "",
    password: c?.prep?.password ?? "",
    my_ip_url: c?.prep?.my_ip_url ?? "",
  },
  check_on: c?.check_on ?? "",
  check_note: c?.check_note ?? "",
});

/** 準備の欄の値（空なら null。コアも空の行を落とす） */
function prepOf(form: ConnectionForm): DbPrep | null {
  const { prep } = form;
  if (!prep.on) return null;
  return normalizePrep({
    prepare: prep.prepare.split("\n"),
    cleanup: prep.cleanup.split("\n"),
    // SQLite はつなぐ先がない。SSH トンネルとポートの転送は一緒に使えない
    tunnel: isFileDb(form.engine) || form.ssh.on ? null : prep.tunnel,
    password: isFileDb(form.engine) ? null : prep.password,
    my_ip_url: prep.my_ip_url,
  });
}

/** 秘密の値の送り方（消すなら null・書いたらその値・編集で書かなければ省いてそのまま・新しく作るなら null） */
export function secretOf(value: string, clear: boolean, editing: boolean): string | null | undefined {
  if (clear) return null;
  if (value) return value;
  return editing ? undefined : null;
}

/** 送る形（使わない欄は null。パスワードは secretOf） */
export function bodyOf(form: ConnectionForm, editing: boolean): NewDbConnectionBody {
  const sqlite = isFileDb(form.engine);
  const text = (v: string) => v.trim() || null;
  const password = secretOf(form.password, form.clearPassword, editing);
  const aiPassword = secretOf(form.ai_password, form.clearAiPassword, editing);
  const f = form.ssh;
  const ssh = !sqlite && f.on && f.host.trim();
  const sshPassword = ssh ? secretOf(f.password, f.clearPassword, editing) : null;
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
    note_path: text(form.note_path),
    ssh: ssh
      ? { host: f.host.trim(), port: f.port.trim() ? Number(f.port) : null, user: text(f.user), identity_file: text(f.identity_file) }
      : null,
    ...(sshPassword === undefined ? {} : { ssh_password: sshPassword }),
    prep: prepOf(form),
    check_on: text(form.check_on),
    check_note: text(form.check_note),
  };
}

/** SSL の様子の短い言葉（「つながるか試す」の結果に添える） */
const SSL_NOTES: Record<DbSslMode, string> = { off: "SSL なし", require: "SSL（証明書は確かめない）", verify: "SSL（証明書も確かめる）" };

/**
 * 「つながるか試す」の結果の文（つながった: 版・SSL・かかった時間 / つながらない: 失敗の文とかかった時間）。
 * ssl は SQLite なら null（SSL の話を出さない）
 */
export function testResultText(result: DbConnectionTestResult, ssl: DbSslMode | null): string {
  const time = result.duration_ms != null ? `${result.duration_ms.toLocaleString()} ms` : null;
  if (!result.ok) return `つながりません: ${result.error}${time ? `（${time}）` : ""}`;
  const notes = [result.server_version ?? "版は不明", ssl ? SSL_NOTES[ssl] : null, time].filter(Boolean);
  return `つながりました（${notes.join(" · ")}）`;
}
