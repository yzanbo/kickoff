// SSH トンネルの ssh に渡す引数と、ssh の出力の読み方（コアの鍵の確かめと、DB ワーカーのトンネルで共通）
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { DbSsh } from "@shared/types";

/** つなぐ先の引数（ポート・ユーザー・鍵のファイル・ホスト。省いたものは ~/.ssh/config と ssh の既定） */
export function sshTargetArgs(ssh: DbSsh): string[] {
  const args: string[] = [];
  if (ssh.port) args.push("-p", String(ssh.port));
  if (ssh.user) args.push("-l", ssh.user);
  if (ssh.identity_file) args.push("-i", ssh.identity_file.startsWith("~") ? path.join(os.homedir(), ssh.identity_file.slice(1)) : ssh.identity_file);
  args.push(ssh.host);
  return args;
}

/** ssh -G の出力（小文字のキー → 値）。ホスト名・ポート・鍵の別名・踏み台を読む */
export function parseSshConfigDump(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = /^(\S+)\s+(.*)$/.exec(line.trim());
    if (m && !map.has(m[1].toLowerCase())) map.set(m[1].toLowerCase(), m[2]);
  }
  return map;
}

/** known_hosts に書く名前（HostKeyAlias があればそれ、22 番でなければ [名前]:ポート） */
export function knownHostsName(hostname: string, port: number, alias: string | null): string {
  if (alias) return alias;
  return port === 22 ? hostname : `[${hostname}]:${port}`;
}

/** 公開鍵（base64）の指紋（ssh-keygen -l と同じ SHA256:…。末尾の = は付けない） */
export function sshFingerprint(base64Key: string): string {
  return `SHA256:${crypto.createHash("sha256").update(Buffer.from(base64Key, "base64")).digest("base64").replace(/=+$/, "")}`;
}

/** ssh-keyscan の出力の行（ホスト 種類 鍵）。コメント・空の行は飛ばす */
export function parseKeyscan(text: string): { type: string; key: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/))
    .filter((p) => p.length >= 3)
    .map((p) => ({ type: p[1], key: p[2] }));
}

/** ~/.ssh/config の Host の名前（* ? ! を含む型は除く。Include の先は読まない） */
export function parseSshConfigHosts(text: string): string[] {
  const hosts: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*Host\s+(.+)$/i.exec(line);
    if (!m) continue;
    for (const name of m[1].split(/\s+/)) if (name && !/[*?!]/.test(name) && !hosts.includes(name)) hosts.push(name);
  }
  return hosts;
}

/** ssh の失敗の文が、サーバーの鍵がまだ known_hosts にないときのものか */
export const isUnknownHostKey = (stderr: string) => /host key is known for|Host key verification failed/i.test(stderr) && !/IDENTIFICATION HAS CHANGED/i.test(stderr);
/** ssh の失敗の文が、サーバーの鍵が前に受け入れたものと違うときのものか */
export const isChangedHostKey = (stderr: string) => /IDENTIFICATION HAS CHANGED/i.test(stderr);
