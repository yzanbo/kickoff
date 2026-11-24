import { DB_DEFAULT_PORTS, type DbEngine } from "@shared/database/types";
import { type DenyVerdict, type GuardRule, type GuardRuleSource, normalizeCommand } from "@/features/guard/core";
import { claudeToolOf } from "@shared/ai/claudeTools";

/** 利用者が「チャットの AI に見せない」と決めた DB の接続の、つなぎ先（ホスト・ポート・SQLite のファイル） */
export interface HiddenDbTarget {
  name: string;
  engine: DbEngine;
  host: string | null;
  port: number | null;
  /** SQLite のファイル（names: コマンドの中で探す書き方（絶対パス・登録したままの書き方・ファイル名）・absolute: ファイルのツールで比べる絶対パス） */
  file: { names: string[]; absolute: string[] } | null;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 前後がホスト名・パスの続きでない（a.db.example.com・db.example.com.au・/x/prod.db.bak の一部としてでない） */
const token = (s: string) => `(?<![\\w.-])${escape(s)}(?![\\w-]|\\.[\\w-])`;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "host.docker.internal"]);
/** DB につなぐコマンド（ポートの指定と一緒に出たら、その DB につなぐとみなす） */
const DB_CLIENTS = /(?<![\w-])(psql|pg_dump|pg_dumpall|pg_restore|pgcli|mysql|mysqldump|mysqlsh|mariadb|mariadb-dump|mycli|usql|sqlite3|litecli)(?![\w-])/;

/** ホストを指しているか。ドットのある名前・IP はそのまま探し、localhost などと 1 語の名前（docker の db など）は、つなぎ先として書いたときだけ */
function mentionsHost(command: string, target: HiddenDbTarget): boolean {
  const host = target.host?.trim().toLowerCase();
  if (!host) return false;
  const text = command.toLowerCase();
  const port = target.port ?? DB_DEFAULT_PORTS[target.engine] ?? null;
  if (LOCAL_HOSTS.has(host)) {
    // この Mac の DB は、ポートで見分ける（ほかの接続・開発のサーバーも localhost にいる）
    if (port === null) return false;
    const hostPort = new RegExp(`${token(host)}:${port}(?!\\d)`);
    const portFlag = new RegExp(`(?:^|\\s)(?:-p|-P|--port)(?:\\s+|=)?['"]?${port}(?!\\d)|\\bport=${port}(?!\\d)`);
    return hostPort.test(text) || (DB_CLIENTS.test(text) && portFlag.test(text));
  }
  if (host.includes(".") || host.includes(":")) return new RegExp(token(host)).test(text);
  // 1 語の名前は、URL の @・ポート付き・-h / --host / host= のときだけ（db/ のようなフォルダ名と取り違えない）
  const h = escape(host);
  return new RegExp(`@${h}(?=[:/?\\s"']|$)|(?<![\\w.-])${h}:\\d|(?:^|\\s)(?:-h|--host)(?:\\s+|=)['"]?${h}(?![\\w.-])|\\bhost=${h}(?![\\w.-])`).test(text);
}

/** SQLite のファイルを指しているか */
function mentionsFile(command: string, target: HiddenDbTarget): boolean {
  return (target.file?.names ?? []).some((n) => n.length > 0 && new RegExp(token(n)).test(command));
}

/**
 * 「見せない」接続の DB に、AI が Kickoff の DB のツールを通らずに入るのを断る（Bash でホスト・接続の URL・SQLite のファイルを使う、
 * SQLite のファイルをファイルのツールで開く）。AI は .env の DATABASE_URL を読んで psql で直接入れ、そこでは読み取り専用も見せないも効かないため。
 * うっかりを防ぐもので、わざと避ける書き方（変数に分けるなど）までは見抜けない
 */
export function evaluateHiddenDbAccess(targets: HiddenDbTarget[], toolName: string, input: Record<string, unknown>): DenyVerdict {
  if (targets.length === 0) return { kind: "pass" };
  const deny = (t: HiddenDbTarget) => ({
    kind: "deny" as const,
    reason: `DB の接続「${t.name}」は、利用者がチャットの AI に見せないと決めた DB です。コマンドやファイルで直接つないだり開いたりしないでください。中身が必要なら、利用者に頼んでください（Kickoff の DB タブの接続の設定で見せるかを変えられます）`,
  });
  // ファイルを開くツール（探す Glob・Grep は見ない）
  const tool = claudeToolOf(toolName);
  const key = tool && !tool.searches ? tool.pathKey : null;
  if (key && typeof input[key] === "string") {
    // パスは作業フォルダで解いた絶対パス（guard の resolveCallPaths）
    const file = input[key];
    const hit = targets.find((t) => t.file?.absolute.includes(file));
    return hit ? deny(hit) : { kind: "pass" };
  }
  if (toolName !== "Bash" || typeof input.command !== "string") return { kind: "pass" };
  const command = normalizeCommand(input.command);
  const hit = targets.find((t) => mentionsHost(command, t) || mentionsFile(command, t));
  return hit ? deny(hit) : { kind: "pass" };
}

/** 見せない DB の守り（Bash とファイルを開くツール。探す Glob・Grep は見ない） */
export function hiddenDbRule(targets: HiddenDbTarget[]): GuardRule {
  return {
    name: "hiddenDb",
    kind: "deny",
    sees: (call) => call.name === "Bash" || claudeToolOf(call.name)?.searches === false,
    check: (call) => evaluateHiddenDbAccess(targets, call.name, call.input),
  };
}

/**
 * 見せない DB の守りを出す口（createDatabase が guard に登録する）。実行のたびにプロジェクトの接続を引き、
 * 見せない接続があるときだけ守りを付ける（SQLite のファイルは作業場所と本体の両方で解く）
 */
export function hiddenDbRuleSource(targetsOf: (projectId: number, dirs: string[]) => HiddenDbTarget[]): GuardRuleSource {
  return {
    name: "hiddenDb",
    rulesFor: (m) => {
      const targets = targetsOf(m.project.id, [m.cwd, m.project.repo_path]);
      return targets.length > 0 ? [hiddenDbRule(targets)] : [];
    },
  };
}
