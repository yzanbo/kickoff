// macOS: TCP のポートを待っているプロセス（lsof）と、プロセスの作業フォルダ（lsof -d cwd）
import { runCommand } from "../../system/exec.js";
import type { ListeningSocket } from "../types.js";

/** lsof の実行ファイル（macOS に入っている） */
const LSOF = "/usr/sbin/lsof";

/**
 * `lsof -nP +c 0 -iTCP -sTCP:LISTEN` を流す（+c 0 がないとコマンド名が 9 文字で切られる。待っているものがなければ終了コード 1）。
 * 自分のユーザーのプロセスしか出ない
 */
const lsofListening = () => runCommand(LSOF, ["-nP", "+c", "0", "-iTCP", "-sTCP:LISTEN"], { okCodes: [1], timeout: 5_000 });

/** lsof の名前の \xNN（空白など）を戻す */
const unescapeLsof = (s: string) => s.replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

/** `lsof -nP +c 0 -iTCP -sTCP:LISTEN` の出力を読む（見出しの行と読めない行は飛ばす） */
export function parseLsof(out: string): ListeningSocket[] {
  const sockets: ListeningSocket[] = [];
  for (const line of out.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 9 || cols[0] === "COMMAND") continue;
    const pid = Number(cols[1]);
    const name = cols.slice(8).join(" ").replace(/\s*\(LISTEN\)$/, "");
    const m = /:(\d+)$/.exec(name);
    if (!Number.isInteger(pid) || !m) continue;
    sockets.push({ process: unescapeLsof(cols[0]), pid, address: name, port: Number(m[1]) });
  }
  return sockets;
}

/** TCP のポートを待っているソケット（lsof を流して読む） */
export const listeningSockets = async (): Promise<ListeningSocket[]> => parseLsof(await lsofListening());

/** `lsof -a -d cwd -p <pid,…> -Fpn` の出力を pid → 作業フォルダ にする（p の行で pid、続く n の行でフォルダ） */
export function parseCwds(out: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let pid: number | null = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid !== null && Number.isInteger(pid)) cwds.set(pid, line.slice(1));
  }
  return cwds;
}

/** プロセスの作業フォルダ（作業フォルダが読めないプロセス（ほかのユーザーのもの）があると終了コード 1 になる） */
export const processCwds = async (pids: number[]): Promise<Map<number, string>> =>
  parseCwds(await runCommand(LSOF, ["-a", "-d", "cwd", "-p", pids.join(","), "-Fpn"], { okCodes: [1], timeout: 5_000 }));
