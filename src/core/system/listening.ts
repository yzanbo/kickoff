// この Mac で TCP のポートを待っているプロセス（lsof）。Docker タブの静かなぶつかり・ワークツリーの帯の選び方・ポートを使っているプロセスで共通にする
import { runCommand } from "./exec.js";

/** lsof の待っているポート 1 つ */
export interface ListeningSocket {
  process: string;
  pid: number;
  /** 127.0.0.1:5432・*:5432・[::1]:5432 など（lsof に出たまま） */
  address: string;
  port: number;
}

/** lsof の実行ファイル（macOS に入っている） */
export const LSOF = "/usr/sbin/lsof";

/**
 * `lsof -nP +c 0 -iTCP -sTCP:LISTEN` を流す（+c 0 がないとコマンド名が 9 文字で切られる。待っているものがなければ終了コード 1）。
 * 自分のユーザーのプロセスしか出ない
 */
export const lsofListening = () => runCommand(LSOF, ["-nP", "+c", "0", "-iTCP", "-sTCP:LISTEN"], { okCodes: [1], timeout: 5_000 });

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
