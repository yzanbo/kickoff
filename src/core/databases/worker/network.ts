// ネットワークでつなぐ DB（PostgreSQL・MySQL）で共通の、つなぎ方の組み立て
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DbTarget } from "../protocol.js";

/** つなぐのを待つ時間（ミリ秒） */
export const CONNECT_TIMEOUT_MS = 10_000;

/** DB に名乗る名前（DB 側の接続の一覧で、Kickoff からの接続と分かるように） */
export const APPLICATION_NAME = "Kickoff";

/** TLS の設定（なし = 使わない / require = 使うが証明書は確かめない / verify = 証明書を確かめる（CA を指定すればそれで）） */
export function tlsOptions(target: DbTarget): false | { rejectUnauthorized: boolean; ca?: string } {
  const ssl = target.ssl;
  if (!ssl) return false;
  if (ssl.mode === "require") return { rejectUnauthorized: false };
  if (!ssl.ca_path) return { rejectUnauthorized: true };
  const file = ssl.ca_path.startsWith("~") ? path.join(os.homedir(), ssl.ca_path.slice(1)) : ssl.ca_path;
  return { rejectUnauthorized: true, ca: fs.readFileSync(file, "utf8") };
}

/** トリガーの定義の文から、いつ（BEFORE など）と何で（INSERT など）を読む */
export function triggerHead(definition: string): { timing: string | null; event: string | null } {
  const head = /\b(BEFORE|AFTER|INSTEAD\s+OF)\s+(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.exec(definition);
  return { timing: head?.[1]?.toUpperCase().replace(/\s+/, " ") ?? null, event: head?.[2]?.toUpperCase() ?? null };
}
