// SSH トンネル（この Mac の ssh -L）。踏み台につなぎ、DB のポートを手元（127.0.0.1 の空いたポート）に転送する。
// 同じ踏み台・同じ DB へのトンネルは、使っている接続があるあいだ 1 本を使い回し、使う接続がなくなったら止める。
// サーバーの鍵は StrictHostKeyChecking=yes（初めてのサーバーはつながず、コアが画面で指紋を確かめてから known_hosts に足す）
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { DB_SSH_UNKNOWN_HOST, type DbSsh } from "@shared/types";
import { isChangedHostKey, isUnknownHostKey, sshTargetArgs } from "../sshArgs.js";

/** 手元のポートにつながるまで待つ時間（ミリ秒。踏み台の起動・ログインを含む） */
const TUNNEL_TIMEOUT_MS = 30_000;

export interface TunnelSpec {
  ssh: DbSsh & { password: string | null };
  /** 踏み台から見た DB の場所 */
  remote_host: string;
  remote_port: number;
}

interface OpenTunnel {
  proc: ChildProcess;
  port: number;
  users: number;
  ready: Promise<number>;
  /** ssh の標準エラーの終わりのほう（転送の失敗を見分ける） */
  stderr: string;
}

/** 空いているポート（いったん開いて閉じる） */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/** 手元のポートに TCP でつながるか */
const canConnect = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

/** SSH のパスワードを ssh に渡す SSH_ASKPASS の小さなスクリプト（環境変数から出すだけ。パスワードはファイルに書かない） */
let askpassFile: string | null = null;
function askpass(): string {
  if (askpassFile && fs.existsSync(askpassFile)) return askpassFile;
  askpassFile = path.join(os.tmpdir(), `kickoff-askpass-${process.pid}.sh`);
  fs.writeFileSync(askpassFile, '#!/bin/sh\nprintf "%s\\n" "$KICKOFF_SSH_PASSWORD"\n', { mode: 0o700 });
  return askpassFile;
}

/** ssh の失敗の文を、画面に出す文にする（初めてのサーバーは DB_SSH_UNKNOWN_HOST の印を頭に付ける。コアが見分ける） */
export function tunnelError(host: string, stderr: string): string {
  const detail = stderr.trim().split("\n").filter(Boolean).slice(-3).join(" / ");
  if (isChangedHostKey(stderr)) {
    return `踏み台（${host}）のサーバーの鍵が、前に受け入れたものと違います。サーバーを入れ替えたのでなければつながないでください（入れ替えたなら ~/.ssh/known_hosts の古い鍵を消してください）`;
  }
  if (isUnknownHostKey(stderr)) return `${DB_SSH_UNKNOWN_HOST}: 踏み台（${host}）は初めてつなぐサーバーです。サーバーの鍵の指紋を確かめてから受け入れてください`;
  if (/Permission denied/i.test(stderr)) return `踏み台（${host}）にログインできません（鍵・ユーザー・パスワード・ssh-agent を確かめてください）: ${detail}`;
  return `SSH トンネルを開けませんでした（${host}）: ${detail || "ssh が終わりました"}`;
}

export function createTunnels() {
  const tunnels = new Map<string, OpenTunnel>();
  const keyOf = (spec: TunnelSpec) => JSON.stringify([spec.ssh, spec.remote_host, spec.remote_port]);

  const start = (key: string, spec: TunnelSpec): OpenTunnel => {
    const entry = { users: 0, stderr: "" } as OpenTunnel;
    entry.ready = (async () => {
      const port = await freePort();
      const env: NodeJS.ProcessEnv = { ...process.env };
      const options = ["-o", "ExitOnForwardFailure=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15", "-o", "ServerAliveInterval=30"];
      if (spec.ssh.password) {
        Object.assign(env, { SSH_ASKPASS: askpass(), SSH_ASKPASS_REQUIRE: "force", DISPLAY: env.DISPLAY ?? ":0", KICKOFF_SSH_PASSWORD: spec.ssh.password });
        options.push("-o", "NumberOfPasswordPrompts=1");
      } else options.push("-o", "BatchMode=yes");
      const proc = spawn("ssh", ["-N", "-L", `127.0.0.1:${port}:${spec.remote_host}:${spec.remote_port}`, ...options, ...sshTargetArgs(spec.ssh)], {
        stdio: ["ignore", "ignore", "pipe"],
        env,
      });
      entry.proc = proc;
      entry.port = port;
      let exited = false;
      proc.stderr?.on("data", (d: Buffer) => (entry.stderr = (entry.stderr + d.toString()).slice(-4000)));
      proc.once("exit", () => {
        exited = true;
        if (tunnels.get(key) === entry) tunnels.delete(key);
      });
      proc.once("error", (e) => {
        exited = true;
        entry.stderr += e.message;
      });
      const end = Date.now() + TUNNEL_TIMEOUT_MS;
      while (Date.now() < end) {
        if (exited) throw new Error(tunnelError(spec.ssh.host, entry.stderr));
        if (await canConnect(port)) return port;
        await new Promise((r) => setTimeout(r, 150));
      }
      proc.kill();
      throw new Error(`SSH トンネルを開けませんでした（${spec.ssh.host}）: ${TUNNEL_TIMEOUT_MS / 1000} 秒たってもつながりません`);
    })();
    // 開けなければ、次の頼みで開き直す
    entry.ready.catch(() => {
      if (tunnels.get(key) === entry) tunnels.delete(key);
    });
    return entry;
  };

  return {
    /** トンネルを使う（なければ開く）。返す key で release する */
    async acquire(spec: TunnelSpec): Promise<{ key: string; port: number }> {
      const key = keyOf(spec);
      let entry = tunnels.get(key);
      // 終わったトンネルは exit で一覧から外れる
      if (!entry) {
        entry = start(key, spec);
        tunnels.set(key, entry);
      }
      entry.users++;
      try {
        return { key, port: await entry.ready };
      } catch (e) {
        entry.users--;
        throw e;
      }
    },
    /** 踏み台から DB への転送が失敗したときの ssh の文（「channel 2: open failed: connect failed: …」。なければ null） */
    forwardFailure(key: string): string | null {
      const lines = tunnels.get(key)?.stderr.split("\n") ?? [];
      return lines.reverse().find((l) => /open failed|connect failed|administratively prohibited/i.test(l))?.trim() ?? null;
    },
    /** 使い終わった（使う接続がなくなったら止める） */
    release(key: string) {
      const entry = tunnels.get(key);
      if (!entry) return;
      entry.users--;
      if (entry.users <= 0) {
        tunnels.delete(key);
        entry.proc?.kill();
      }
    },
    closeAll() {
      for (const entry of tunnels.values()) entry.proc?.kill();
      tunnels.clear();
    },
  };
}
