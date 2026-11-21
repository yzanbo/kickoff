// 守りの判定の網: Bash のコマンドとファイルのツールの呼び出しを、守りごと・判定の組み合わせごとに当てた答えを
// test-records/core/guard-verdicts.json に残す（守りを 1 つの判定にする作り直しの前後で同じ答えにする）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { evaluateHiddenDbAccess, type HiddenDbTarget } from "@/features/database/core/guard/hiddenDb";
import { evaluateCompileCacheEnv } from "@/features/guard/core/guard/compileCacheGuard";
import { evaluateDeleteCommand } from "@/features/guard/core/guard/deleteGuard";
import { evaluateGitHookBypass } from "@/features/guard/core/guard/gitHookGuard";
import { judgeCommand, judgeReadPath, judgeWritePath } from "@/features/guard/core/guard/judgeTool";
import { evaluateReferenceWrite, evaluateUntrackedWrite, resolveCallPaths } from "@/features/guard/core/guard/scope";
import { evaluateSelfProtection, type SelfInfo } from "@/features/guard/core/guard/selfProtection";
import { MACOS_SELF_GUARD } from "@/features/guard/core/macosRules";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { maskVolatile, matchRecord } from "@/foundation/core/testing/record";
import { tempDir } from "@/foundation/core/testing/tempDir";

const home = os.homedir();
const DATA = `${home}/Library/Application Support/Kickoff`;
const self: SelfInfo = { pids: [4242, 4100], dataDir: DATA, port: 4317, appName: "Kickoff", guard: MACOS_SELF_GUARD, appBundle: "/Applications/Kickoff.app" };

/** 作業場所（Git。compose.yaml を管理し、.env は無視）・参照資料・見せない DB の SQLite のファイル */
function world() {
  const root = tempDir({ real: true });
  const cwd = path.join(root, "work");
  gitRepo({ dir: cwd, files: { "compose.yaml": "services: {}\n", ".gitignore": ".env\n", "data/.keep": "" } });
  fs.writeFileSync(path.join(cwd, ".env"), "PORT=3000\n");
  const ref = path.join(root, "ref");
  fs.mkdirSync(ref);
  const sqlite = path.join(cwd, "data", "app.db");
  const hidden: HiddenDbTarget[] = [
    { name: "本番", engine: "postgres", host: "db.example.com", port: 5432, file: null },
    { name: "手元", engine: "postgres", host: "localhost", port: 5433, file: null },
    { name: "compose", engine: "mysql", host: "db", port: null, file: null },
    { name: "SQLite", engine: "sqlite", host: null, port: null, file: { names: [sqlite, "data/app.db", "app.db"], absolute: [sqlite] } },
  ];
  return { root, cwd, ref, sqlite, hidden };
}
type World = ReturnType<typeof world>;

const COMMANDS = [
  "npm test",
  "git status && git diff -- compose.yaml",
  "rm -rf dist",
  "/bin/rm a.txt",
  "unlink a; shred -u b",
  "find . -name '*.log' -delete",
  "find . -name '*.tmp' -exec rm {} +",
  "ls | xargs -0 rm",
  "git clean -fd",
  "git clean -n",
  "git rm --cached a.txt",
  "rmdir empty",
  "sudo FOO=1 rm -f x",
  "sh -c 'rm -rf build'",
  "bash -lc \"echo ok && rm x\"",
  "sh -c \"sh -c 'sh -c \\\"rm x\\\"'\"",
  "sh -c \"sh -c 'sh -c \\\"sh -c rm\\\"'\"",
  "kickoff-trash dist",
  `"${DATA}/bin/kickoff-trash" dist`,
  "git commit -m 'fix' --no-verify",
  "git commit -am wip",
  "git commit -mfix -n",
  "git commit -m -n",
  "git push --no-veri origin main",
  "git merge --no-verify topic",
  "git -c core.hooksPath=/dev/null commit -m x",
  "git --config-env=core.hooksPath=HOOKS commit -m x",
  "git config core.hooksPath .githooks",
  "git config --unset core.hooksPath",
  "git config --get core.hooksPath",
  "bash -c 'git commit --no-verify -m x'",
  "NODE_COMPILE_CACHE=/tmp/c npm run dev",
  "env NODE_COMPILE_CACHE_PORTABLE=1 electron .",
  "/usr/bin/env -i NODE_COMPILE_CACHE=/tmp/c node a.js",
  "export NODE_COMPILE_CACHE=/tmp/c",
  "launchctl setenv NODE_COMPILE_CACHE /tmp/c",
  "open --env NODE_COMPILE_CACHE=/tmp/c -a Kickoff",
  "eval 'export NODE_COMPILE_CACHE=/tmp/c'",
  "env -S 'NODE_COMPILE_CACHE=/tmp/c node a.js'",
  "sudo env -i sh -c 'export NODE_COMPILE_CACHE=/tmp/c'",
  "echo $NODE_COMPILE_CACHE; printenv NODE_COMPILE_CACHE; unset NODE_COMPILE_CACHE",
  "kill -TERM 4242",
  "kill -9 4100",
  "kill -TERM 42420",
  "pkill -f Kickoff",
  "killall 'Kickoff Dev'",
  "osascript -e 'tell application \"Kickoff\" to quit'",
  "curl -s localhost:4317/api/status",
  "curl -s localhost:4318/api/status",
  `cat "${DATA}/kickoff.db"`,
  "ls ~/Library/Application\\ Support/Kickoff/uploads",
  "ls $HOME/Library/Application\\ Support/Kickoff\\ Dev",
  "cp -R /Applications/Kickoff.app /tmp/k",
  "psql -h db.example.com -U app",
  "psql postgres://app@localhost:5433/app",
  "psql -p 5434 -h localhost",
  "mysql -h db -u root",
  "ls db/",
  "sqlite3 data/app.db .tables",
  "sqlite3 other.db",
  "git add . && git commit -m x",
  "git -C sub checkout -- a.txt",
];

/** ファイルのツールの呼び出し（パスの書き方: 作業場所の中・外・相対・~・自分の保存先・見せない DB のファイル） */
function fileCalls(w: World): Array<[string, Record<string, unknown>]> {
  const at = (p: string) => ({ file_path: p });
  return [
    ["Read", at(path.join(w.cwd, "compose.yaml"))],
    ["Write", at(path.join(w.cwd, "compose.yaml"))],
    ["Edit", at(path.join(w.cwd, ".env"))],
    ["Write", at(path.join(w.cwd, "new.txt"))],
    ["MultiEdit", at("compose.yaml")],
    ["Write", at("new-relative.txt")],
    ["Write", at(path.join(w.cwd, ".git", "config"))],
    ["Write", at(path.join(w.ref, "a.md"))],
    ["Read", at(path.join(w.ref, "a.md"))],
    ["Write", at(path.join(w.root, "outside.txt"))],
    ["Write", at("../outside.txt")],
    ["NotebookEdit", { notebook_path: path.join(w.ref, "n.ipynb") }],
    ["Read", at(`${DATA}/kickoff.db`)],
    ["Read", at(`${DATA}/uploads/a.png`)],
    ["Write", at(`${DATA}/uploads/a.png`)],
    ["Read", at("~/Library/Application Support/Kickoff/kickoff.db")],
    ["Read", at("~/Library/Application Support/Kickoff Dev/kickoff.db")],
    ["Glob", { pattern: "*.db", path: DATA }],
    ["Grep", { pattern: "x", path: `${DATA}/logs` }],
    ["Read", at(w.sqlite)],
    ["Edit", at(w.sqlite)],
    ["Read", at("data/app.db")],
    ["Grep", { pattern: "x", path: w.sqlite }],
    ["Glob", { pattern: "*.db", path: path.join(w.cwd, "data") }],
    ["Write", at("~/notes.txt")],
  ];
}

type Verdict = { kind: string; reason?: string; title?: string; description?: string; deniedReason?: string; rememberTarget?: string } | { decision: string; reason?: string };

/** 判定を 1 行の文に（pass は省き、ほかは種類と文） */
function line(v: Verdict): string | null {
  const kind = "kind" in v ? v.kind : v.decision;
  if (kind === "pass") return null;
  const parts = Object.entries(v).filter(([k]) => k !== "kind" && k !== "decision").map(([k, x]) => `${k}=${String(x)}`);
  return [kind, ...parts].join(" | ");
}

/** 守りごとの答え（pass の守りは省く。どれも pass なら空）。呼ぶ側と同じく、パスを作業フォルダで解いてから当てる */
async function perGuard(w: World, tool: string, raw: Record<string, unknown>): Promise<Record<string, string>> {
  const { input } = resolveCallPaths({ name: tool, input: raw, cwd: w.cwd });
  const verdicts: Record<string, Verdict> = {
    self: evaluateSelfProtection(self, tool, input),
    reference: evaluateReferenceWrite(w.cwd, [w.ref], tool, input),
    untracked: await evaluateUntrackedWrite(w.cwd, tool, input),
    hiddenDb: evaluateHiddenDbAccess(w.hidden, tool, input),
    delete: evaluateDeleteCommand(tool, input),
    gitHook: evaluateGitHookBypass(tool, input),
    compileCache: evaluateCompileCacheEnv(tool, input),
  };
  return Object.fromEntries(Object.entries(verdicts).flatMap(([name, v]) => {
    const text = line(v);
    return text === null ? [] : [[name, text]];
  }));
}

/** 記録の鍵（一時フォルダ・ホームのパスを伏せる。maskVolatile は値だけを伏せるので、鍵は先に伏せる） */
const key = (text: string) => maskVolatile(text, { paths: { HOME: home } });

const docker = { check: async (c: string) => (c.includes("down") ? { title: "ほかの作業場所の Docker を止めます", description: "本体の db" } : null) };
const brokenDocker = { check: async () => Promise.reject(new Error("docker が答えない")) };

test("守りごとの判定（Bash・ファイルのツール）", async () => {
  const w = world();
  const bash: Record<string, Record<string, string>> = {};
  for (const command of COMMANDS) bash[key(command)] = await perGuard(w, "Bash", { command });
  const files: Record<string, Record<string, string>> = {};
  for (const [tool, input] of fileCalls(w)) files[key(`${tool} ${JSON.stringify(input)}`)] = await perGuard(w, tool, input);
  await matchRecord("core/guard-verdicts.json", maskVolatile({ bash, files }, { paths: { HOME: home } }));
});

test("判定の組み合わせ（コマンド・書く先・読む先。聞いてくる CLI が使う形）", async () => {
  const w = world();
  const allowed = new Set<string>();
  const full = {
    params: {
      cwd: w.cwd,
      readOnlyPaths: [w.ref],
      untrackedOnly: false,
      hiddenDb: w.hidden,
      deleteGuard: true,
      dockerGuard: docker,
      writeScope: { writableDirs: [path.join(w.root, "notes")], workplaces: async () => [{ path: w.cwd, worktree_path: null, branch: "main" }], allowed },
    },
    self,
  };
  const configs = {
    full,
    untracked: { params: { ...full.params, untrackedOnly: true } },
    bare: { params: { cwd: w.cwd } },
    brokenDocker: { params: { cwd: w.cwd, dockerGuard: brokenDocker } },
  };
  const out: Record<string, Record<string, string>> = {};
  const note = (config: string, what: string, v: Verdict) => {
    (out[config] ??= {})[key(what)] = line(v) ?? "pass";
  };
  for (const [name, ctx] of Object.entries(configs)) {
    for (const command of [...COMMANDS, "docker compose down", "docker ps"]) note(name, `command ${command}`, await judgeCommand(ctx, command));
    for (const [tool, input] of fileCalls(w)) {
      const p = (input.file_path ?? input.notebook_path ?? input.path) as string;
      if (tool === "Read" || tool === "Glob" || tool === "Grep") note(name, `read ${p}`, judgeReadPath(ctx, p));
      else note(name, `write ${p}`, await judgeWritePath(ctx, p));
    }
  }
  // 「このチャットでは許可」で覚えた書く先は聞かない
  const outside = await judgeWritePath(full, path.join(w.root, "outside.txt"));
  if (outside.kind === "ask" && outside.rememberTarget) allowed.add(outside.rememberTarget);
  note("full", "write (覚えたあと) outside.txt", await judgeWritePath(full, path.join(w.root, "outside.txt")));
  await matchRecord("core/guard-judge.json", maskVolatile(out, { paths: { HOME: home } }));
});
