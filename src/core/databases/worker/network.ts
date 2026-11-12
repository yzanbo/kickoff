// ネットワークでつなぐ DB（PostgreSQL・MySQL）で共通の、つなぎ方の組み立て
import fs from "node:fs";
import tls from "node:tls";
import os from "node:os";
import path from "node:path";
import type { DbTarget } from "../protocol.js";

/** つなぐのを待つ時間（ミリ秒） */
export const CONNECT_TIMEOUT_MS = 10_000;

/** DB に名乗る名前（DB 側の接続の一覧で、Kickoff からの接続と分かるように） */
export const APPLICATION_NAME = "Kickoff";

/** DB の側の時間の上限に渡すミリ秒（整数・1 以上・DB が受ける 32 ビットの整数まで） */
export const dbTimeoutMs = (ms: number) => Math.min(2_147_483_647, Math.max(1, Math.round(ms)));

/** TLS の設定（なし = 使わない / require = 使うが証明書は確かめない / verify = 証明書を確かめる（CA を指定すればそれで）） */
export function tlsOptions(target: DbTarget): false | tls.ConnectionOptions {
  const ssl = target.ssl;
  if (!ssl) return false;
  // SSH トンネルを通すときは 127.0.0.1 につなぐので、名乗る名前（SNI）と証明書の名前は元のホストで確かめる
  const via: tls.ConnectionOptions = target.tls_host ? { servername: target.tls_host, checkServerIdentity: (_host, cert) => tls.checkServerIdentity(target.tls_host!, cert) } : {};
  if (ssl.mode === "require") return { rejectUnauthorized: false, ...(target.tls_host ? { servername: target.tls_host } : {}) };
  if (!ssl.ca_path) return { rejectUnauthorized: true, ...via };
  const file = ssl.ca_path.startsWith("~") ? path.join(os.homedir(), ssl.ca_path.slice(1)) : ssl.ca_path;
  return { rejectUnauthorized: true, ca: fs.readFileSync(file, "utf8"), ...via };
}

/** トリガーの定義の文から、いつ（BEFORE など）と何で（INSERT など）を読む */
export function triggerHead(definition: string): { timing: string | null; event: string | null } {
  const head = /\b(BEFORE|AFTER|INSTEAD\s+OF)\s+(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.exec(definition);
  return { timing: head?.[1]?.toUpperCase().replace(/\s+/, " ") ?? null, event: head?.[2]?.toUpperCase() ?? null };
}
