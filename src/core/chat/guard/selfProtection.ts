import os from "node:os";
import path from "node:path";
import { expandHome, isInside } from "../../system/paths.js";

/**
 * エージェントを動かしている Kickoff 自身（製品版で Kickoff を作るときは製品版）。
 * エージェントがうっかり自分を止めたり、自分のデータ・API を触ったりしないよう、PreToolUse フックで断るのに使う
 */
export interface SelfInfo {
  /** Kickoff のプロセス（コアは Electron のメインプロセス・daemon の中で動く） */
  pid: number;
  /** 保存先（~/Library/Application Support/Kickoff など） */
  dataDir: string;
  /** コアの API のポート */
  port: number;
  /** アプリの名前（保存先のフォルダ名と同じ。Kickoff / Kickoff Dev） */
  appName: string;
  /** インストールしたアプリの本体（/Applications/Kickoff.app など）。開発中（node_modules の Electron）・daemon ではない */
  appBundle?: string;
}

/** いま動いているプロセスから、自分の情報を作る */
export function currentSelf(dataDir: string, port: number): SelfInfo {
  const bundle = process.execPath.match(/^(.+?\.app)\/Contents\/MacOS\//)?.[1];
  return {
    pid: process.pid,
    dataDir: path.resolve(dataDir),
    port,
    appName: path.basename(dataDir),
    appBundle: bundle && !bundle.includes("/node_modules/") ? bundle : undefined,
  };
}

type SelfDecision = { decision: "pass" } | { decision: "deny"; reason: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** シェルの書き方の違い（~・$HOME・\ で区切った空白）をそろえて、パスを探しやすくする */
export function normalizeCommand(command: string): string {
  const home = os.homedir();
  return command
    .replace(/\\ /g, " ")
    .replace(/\$\{HOME\}|\$HOME/g, home)
    .replace(/(^|[\s"'=:(])~(?=\/)/g, `$1${home}`);
}

/** パスの後ろが続きの名前でない（Kickoff の後ろに「 Dev」や別の文字が続かない）ところで、そのパスを指しているか */
function mentionsPath(command: string, target: string): boolean {
  return new RegExp(`${escape(target)}(?=$|[/"'\\s;)|&])(?! Dev\\b)`).test(command);
}

/** 名前（Kickoff など）を、ほかの名前の一部・「Kickoff Dev」としてでなく指しているか */
function mentionsName(command: string, name: string): boolean {
  return new RegExp(`(?<![\\w-])${escape(name)}(?![\\w-]| Dev\\b)`).test(command);
}

const FILE_TOOLS: Record<string, string[]> = {
  Read: ["file_path"],
  Write: ["file_path"],
  Edit: ["file_path"],
  MultiEdit: ["file_path"],
  NotebookEdit: ["notebook_path"],
  Glob: ["path"],
  Grep: ["path"],
};

/**
 * ツールの呼び出しが、エージェントを動かしている Kickoff 自身を壊すものなら断る:
 * 自分のプロセスを止める（kill・pkill・killall・AppleScript）・アプリ本体に触る・保存先のデータに触る・自分の API を叩く。
 * 開発版（Kickoff Dev）は別の名前・保存先・ポート・プロセスなので、ここでは断らない。うっかりを防ぐもので、わざと避ける書き方までは見抜けない
 */
export function evaluateSelfProtection(self: SelfInfo, toolName: string, input: Record<string, unknown>): SelfDecision {
  const who = `「${self.appName}」はこのチャットを動かしているアプリです`;
  // 開発版へ案内するのは、インストールしたアプリ（製品版）のときだけ（開発版が自分のときに開発版を勧めると食い違う）
  const dev = self.appBundle ? "Kickoff を作って確かめるときは、開発版（npm run dev。Kickoff Dev・ポート 4318）を使ってください" : "";
  const join = (...parts: string[]) => parts.filter(Boolean).join("。");

  for (const key of FILE_TOOLS[toolName] ?? []) {
    const file = input[key];
    // チャットの添付ファイル（保存先の uploads）は、Read で読むだけなら通す（画面は「Read ツールで読めます」と案内している）
    if (toolName === "Read" && typeof file === "string" && isInside(path.join(self.dataDir, "uploads"), path.resolve(expandHome(file)))) continue;
    if (typeof file === "string" && file && isInside(self.dataDir, expandHome(file))) {
      return { decision: "deny", reason: join(who, `その保存先（${self.dataDir}）は読み書きできません`, dev) };
    }
  }
  if (toolName !== "Bash" || typeof input.command !== "string") return { decision: "pass" };

  const command = normalizeCommand(input.command);
  if (mentionsPath(command, self.dataDir)) {
    return { decision: "deny", reason: join(who, `その保存先（${self.dataDir}）にはコマンドでも触れません`, dev) };
  }
  if (self.appBundle && mentionsPath(command, self.appBundle)) {
    return { decision: "deny", reason: `${who}。アプリ本体（${self.appBundle}）には触れません。入れ替えは利用者が macOS のターミナルで npm run install-app を実行します` };
  }
  if (new RegExp(`(localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\]):${self.port}(?!\\d)`).test(command)) {
    return { decision: "deny", reason: join(who, `その API（ポート ${self.port}）は叩けません`, dev) };
  }
  const stop = `${who}。止めると、このチャットも止まります`;
  if (new RegExp(`\\bkill\\b[^\\n;&|]*?(?<![\\d.])${self.pid}(?![\\d.])`).test(command)) {
    return { decision: "deny", reason: `${stop}（プロセス ${self.pid}）。開発版を止めるときは、そのプロセスを確かめてから kill -TERM を送ってください` };
  }
  if (/\b(pkill|killall)\b/.test(command) && mentionsName(command, self.appName)) {
    return { decision: "deny", reason: `${stop}。名前でまとめて止めないでください` };
  }
  if (/\bosascript\b/.test(command) && mentionsName(command, self.appName)) {
    return { decision: "deny", reason: `${stop}。AppleScript で操作しないでください` };
  }
  return { decision: "pass" };
}
