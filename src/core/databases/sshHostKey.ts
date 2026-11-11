// 踏み台のサーバーの鍵（初めてつなぐサーバーは、指紋を画面で確かめてから ~/.ssh/known_hosts に足す。ターミナルの ssh と同じ場所）
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DbSsh, DbSshHostKey } from "@shared/types";
import { Conflict, Invalid } from "../http/errors.js";
import { runCommand } from "../system/exec.js";
import { knownHostsName, parseKeyscan, parseSshConfigDump, parseSshConfigHosts, sshFingerprint, sshTargetArgs } from "./sshArgs.js";

const sshDir = () => path.join(os.homedir(), ".ssh");

/** ~/.ssh/config を解いた、つなぐ先のホスト名・ポート・known_hosts の名前 */
async function resolve(ssh: DbSsh): Promise<{ hostname: string; port: number; name: string }> {
  const dump = parseSshConfigDump(await runCommand("ssh", ["-G", ...sshTargetArgs(ssh)]));
  const proxy = dump.get("proxyjump") ?? dump.get("proxycommand");
  if (proxy && proxy !== "none") {
    throw new Invalid(`踏み台（${proxy}）を通るサーバーの鍵は、ここでは確かめられません。ターミナルで一度「ssh ${ssh.host}」でつなぎ、鍵を受け入れてからつないでください`);
  }
  const hostname = dump.get("hostname") ?? ssh.host;
  const port = Number(dump.get("port") ?? 22) || 22;
  const alias = dump.get("hostkeyalias");
  return { hostname, port, name: knownHostsName(hostname, port, alias && alias !== "none" ? alias : null) };
}

async function scan(ssh: DbSsh) {
  const { hostname, port, name } = await resolve(ssh);
  const out = await runCommand("ssh-keyscan", ["-T", "10", "-p", String(port), hostname], { okCodes: [1] }).catch(() => "");
  const keys = parseKeyscan(out);
  if (keys.length === 0) throw new Invalid(`サーバー（${hostname}:${port}）の鍵を読めませんでした。ホスト名・ポート・VPN を確かめてください`);
  return { name, keys };
}

/** サーバーの鍵と指紋（画面で確かめてもらう） */
export async function scanSshHostKey(ssh: DbSsh): Promise<DbSshHostKey> {
  const { name, keys } = await scan(ssh);
  return { host: name, keys: keys.map((k) => ({ type: k.type, fingerprint: sshFingerprint(k.key) })) };
}

/** 画面で見せた指紋のサーバーの鍵を ~/.ssh/known_hosts に足す（読み直した鍵の指紋が見せたものと合わなければ足さない） */
export async function acceptSshHostKey(ssh: DbSsh, fingerprints: string[]): Promise<void> {
  if (fingerprints.length === 0) throw new Invalid("受け入れる鍵の指紋を渡してください");
  const { name, keys } = await scan(ssh);
  const scanned = new Set(keys.map((k) => sshFingerprint(k.key)));
  if (!fingerprints.every((f) => scanned.has(f))) throw new Conflict("サーバーの鍵が、確かめたときと変わりました。もう一度確かめてください");
  await fs.mkdir(sshDir(), { recursive: true, mode: 0o700 });
  const lines = keys.map((k) => `${name} ${k.type} ${k.key}`).join("\n");
  await fs.appendFile(path.join(sshDir(), "known_hosts"), `${lines}\n`, { mode: 0o600 });
}

/** ~/.ssh/config の Host の一覧（なければ空） */
export async function sshConfigHosts(): Promise<string[]> {
  const text = await fs.readFile(path.join(sshDir(), "config"), "utf8").catch(() => "");
  return parseSshConfigHosts(text);
}
