// 守りの門: 守りの決まりを呼び出しに当て、断る・聞く（承認カード）・権限モードに任せるを答える（承認を聞いてくる CLI と、Claude のフック）
import { test } from "vitest";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import type { ApprovalDecision } from "@shared/chat/approvalTypes";
import type { ApprovalRequest } from "@/features/ai/core/index";
import { testMaterials, type TestGuardMaterials } from "@/app/core/testing/testGate";
import { setupCore, until } from "@/app/core/testing/testCore";
import { ScriptedProvider } from "@/features/ai/core/testing";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { toolGateFactory } from "./gate";
import { judgeFileWrite, WRITE_SCOPE_DENIED } from "./guard/writeScope";
import { MACOS_SELF_GUARD } from "./macosRules";
import type { GuardRuleSource, GuardVerdict } from "./rules";

/** 上の機能が登録する口の代わり: Docker の守り（聞く。判定に失敗したら通す）と見せない DB（断る） */
const DOCKER_DENIED = "利用者が拒否しました";
function sourcesOf(m: TestGuardMaterials): GuardRuleSource[] {
  const guard = m.dockerGuard;
  const check = async (command: string): Promise<GuardVerdict> => {
    const ask = await guard?.check(command).catch(() => null);
    return ask ? { kind: "ask", ...ask, deniedReason: DOCKER_DENIED } : { kind: "pass" };
  };
  return [
    { name: "docker", rulesFor: () => (guard ? [{ name: "docker", kind: "ask", sees: (c) => c.name === "Bash", check: (c) => check(String(c.input.command)) }] : []) },
    { name: "hiddenDb", rulesFor: () => [{ name: "hiddenDb", kind: "deny", sees: (c) => c.name !== "Bash", check: (c) => (m.hiddenDb?.some((t) => t.file?.absolute.includes(String(c.input.file_path))) ? { kind: "deny", reason: "見せない DB" } : { kind: "pass" }) }] },
  ];
}

/** 門と、出した承認カードの控え（answer: カードへの答え） */
function gateOf(materials: TestGuardMaterials & { cwd: string }, answer: ApprovalDecision = { action: "allow" }, self?: Parameters<typeof toolGateFactory>[0]) {
  const asked: ApprovalRequest[] = [];
  const requestApproval = async (req: ApprovalRequest) => (asked.push(req), answer);
  const gate = toolGateFactory(self, sourcesOf(materials))(testMaterials(materials), { requestApproval }, new AbortController().signal);
  return { gate, asked };
}
const bash = (command: string) => ({ name: "Bash", input: { command } });
const docker = { check: async (c: string) => (c.includes("down") ? { title: "止めます", description: "本体の db" } : null) };

test("コマンド: 断る守りは断り、ほかの作業場所の Docker は権限モードによらず聞き、何もなければ null（権限モードに任せる）", async () => {
  const { gate, asked } = gateOf({ cwd: "/w", deleteGuard: true, dockerGuard: docker, permissionMode: "auto" });
  assert.equal((await gate.guard(bash("rm -rf dist")))?.allow, false);
  assert.deepEqual(await gate.guard(bash("docker compose down"), { toolUseId: "c1" }), { allow: true });
  assert.deepEqual([asked[0].title, asked[0].canRemember, asked[0].toolUseId], ["止めます", false, "c1"]);
  assert.equal(await gate.guard(bash("npm test")), null);
  // git のフックを飛ばす・NODE_COMPILE_CACHE を設定するは、守りの材料によらず断る（読むだけは通す）
  assert.equal((await gateOf({ cwd: "/w" }).gate.guard(bash("git push --no-verify")))?.allow, false);
  assert.equal((await gateOf({ cwd: "/w" }).gate.guard(bash("export NODE_COMPILE_CACHE=/tmp/c")))?.allow, false);
  assert.equal(await gateOf({ cwd: "/w" }).gate.guard(bash("printenv NODE_COMPILE_CACHE")), null);
  // Docker の判定が失敗したら通す。断ったら理由に利用者の言葉を添える
  assert.equal(await gateOf({ cwd: "/w", dockerGuard: { check: async () => Promise.reject(new Error("x")) } }).gate.guard(bash("docker ps")), null);
  assert.deepEqual(await gateOf({ cwd: "/w", dockerGuard: docker }, { action: "deny", message: "今は" }).gate.guard(bash("docker compose down")), { allow: false, reason: `${DOCKER_DENIED}（利用者の言葉: 今は）` });
});

test("断る守りだけ（deny）: 聞く守りは見ない（カードを出さない）", async () => {
  const { gate, asked } = gateOf({ cwd: "/w", deleteGuard: true, dockerGuard: docker });
  assert.equal((await gate.deny(bash("rm a")))?.allow, false);
  assert.equal(await gate.deny(bash("docker compose down")), null);
  assert.equal(asked.length, 0);
});

test("書く先: 参照資料は断り、作業場所の外は「このチャットでは許可」で覚えられる形で聞き、覚えたものは聞かない", async () => {
  const root = tempDir({ real: true });
  const work = path.join(root, "w");
  const allowed = new Set<string>();
  const materials = { cwd: work, readOnlyPaths: [path.join(root, "ref")], writeScope: { writableDirs: [], workplaces: async () => [], allowed } };
  const { gate, asked } = gateOf(materials, { action: "allow_always" });
  const write = (file: string) => ({ name: "Write", input: { file_path: file } });
  assert.equal((await gate.guard(write(path.join(root, "ref", "a.md"))))?.allow, false);
  assert.equal(await gate.guard(write(path.join(work, "a.ts"))), null);
  assert.deepEqual(await gate.guard(write(path.join(root, "other.txt"))), { allow: true, approved: true });
  assert.equal(asked[0].rememberScope, "chat");
  assert.equal(allowed.size, 1);
  assert.equal(await gate.guard(write(path.join(root, "other.txt"))), null);
  assert.equal(asked.length, 1);
  // 断ったら書き込み先の守りの文
  const denied = gateOf({ ...materials, writeScope: { ...materials.writeScope, allowed: new Set() } }, { action: "deny" });
  assert.deepEqual(await denied.gate.guard(write(path.join(root, "x.txt"))), { allow: false, reason: WRITE_SCOPE_DENIED });
});

test("書く先をまとめて（guardWrites）: 最初に断られたら止め、聞いて許されたものがあれば通す、どれも言わなければ null", async () => {
  const root = tempDir({ real: true });
  const work = path.join(root, "w");
  const materials = { cwd: work, readOnlyPaths: [path.join(root, "ref")], writeScope: { writableDirs: [], workplaces: async () => [], allowed: new Set<string>() } };
  const { gate, asked } = gateOf(materials);
  assert.equal(await gate.guardWrites([path.join(work, "a.ts")]), null);
  assert.deepEqual(await gate.guardWrites([path.join(work, "a.ts"), path.join(root, "o.txt")]), { allow: true, approved: true });
  assert.equal((await gate.guardWrites([path.join(root, "ref", "a.md"), path.join(root, "p.txt")]))?.allow, false);
  assert.equal(asked.length, 1);
});

test("読む先: 自分の保存先・見せない DB の SQLite のファイルは断り、ほかは null。相対パスは作業フォルダ、~ はホームで解く", async () => {
  const work = tempDir({ real: true });
  const secret = path.join(work, "data", "secret.db");
  const hiddenDb = [{ name: "本番", engine: "sqlite" as const, host: null, port: null, file: { names: [secret], absolute: [secret] } }];
  const self = { pids: [1], dataDir: path.join(os.homedir(), "Library", "Application Support", "Kickoff"), port: 4317, appName: "Kickoff", guard: MACOS_SELF_GUARD };
  const { gate } = gateOf({ cwd: work, hiddenDb }, undefined, self);
  assert.equal((await gate.guardRead(secret))?.allow, false);
  assert.equal((await gate.guardRead("./data/../data/secret.db"))?.allow, false);
  assert.equal((await gate.guardRead("~/Library/Application Support/Kickoff/kickoff.db"))?.allow, false);
  assert.equal((await gate.guard({ name: "Write", input: { file_path: "data/secret.db" } }))?.allow, false);
  assert.equal(await gate.guardRead(path.join(work, "src", "a.ts")), null);
});

test("権限モードの答え・承認なしのコマンド・断ったことを伝える文", async () => {
  const plan = gateOf({ cwd: "/w", permissionMode: "plan" }).gate;
  assert.equal((await plan.byMode("command", bash("npm test")))?.allow, false);
  assert.deepEqual(await gateOf({ cwd: "/w", permissionMode: "acceptEdits" }).gate.byMode("edit", { name: "Write", input: {} }), { allow: true });
  const { gate, asked } = gateOf({ cwd: "/w" }, { action: "allow_always" });
  assert.deepEqual(await gate.byMode("command", bash("npm i"), { toolUseId: "c1", description: "入れる" }), { allow: true, forSession: true });
  assert.deepEqual([asked[0].description, asked[0].canRemember], ["入れる", true]);
  // 「毎回確認」でも承認なしのコマンドの一覧は見ない（いまのとおり）
  assert.ok(gate.allowedCommands.includes("git status") && gate.allowedCommands.includes("npm test"));
  assert.ok(!gate.allowedCommands.some((c) => c.startsWith("git commit")));
  assert.equal(gate.note("コマンド「x」", "理由"), "［Kickoff］コマンド「x」を断りました: 理由");
});

test("覚えた書く先（remembered）: 「このチャットでは許可」で覚えた書く先への書き込みだけ true（相対パスは作業フォルダで解く）", async () => {
  const root = tempDir({ real: true });
  const work = path.join(root, "w");
  const allowed = new Set<string>();
  const { gate } = gateOf({ cwd: work, writeScope: { writableDirs: [], workplaces: async () => [], allowed } }, { action: "allow_always" });
  const write = (file: string) => ({ name: "Write", input: { file_path: file } });
  assert.equal(gate.remembered(write(path.join(root, "o.txt"))), false);
  await gate.guard(write(path.join(root, "o.txt")));
  assert.equal(gate.remembered(write(path.join(root, "o.txt"))), true);
  assert.equal(gate.remembered(write("../o.txt")), true);
  assert.equal(gate.remembered({ name: "Read", input: { file_path: path.join(root, "o.txt") } }), false);
  assert.equal(gate.remembered(bash("touch ../o.txt")), false);
});

test("CLI の決まりの例外（writeExceptions）: 足した計画のフォルダとメモリは聞かずに書け、ほかの AI（例外なし）は聞く", async () => {
  const root = tempDir({ real: true });
  const work = path.join(root, "w");
  const plans = path.join(root, "claude", "plans");
  const projects = path.join(root, "claude", "projects");
  const writeScope = { writableDirs: [], workplaces: async () => [], allowed: new Set<string>() };
  const write = (file: string) => ({ name: "Write", input: { file_path: file } });
  const claude = gateOf({ cwd: work, writeScope, writeExceptions: { writableDirs: [plans], memoryParents: [projects] } });
  assert.equal(await claude.gate.guard(write(path.join(plans, "p.md"))), null);
  assert.equal(await claude.gate.guard(write(path.join(projects, "app", "memory", "m.md"))), null);
  assert.deepEqual(await claude.gate.guard(write(path.join(projects, "app", "other.md"))), { allow: true, approved: true });
  const other = gateOf({ cwd: work, writeScope });
  assert.deepEqual(await other.gate.guard(write(path.join(plans, "p.md"))), { allow: true, approved: true });
  assert.equal(claude.asked.length + other.asked.length, 2);
});

test("砂場で止まったときの文（sandboxDeniedNote）: 砂場があれば断られた場所を説明し、ほかの作業場所は書き込み先の守りの文。砂場がなければ null", async () => {
  const root = tempDir({ real: true });
  const work = path.join(root, "w");
  const other = path.join(root, "w2");
  const sandbox = { writableDirs: [work], readOnlyDirs: [], unsandboxedCommands: [], proxyPort: null };
  const workplaces = async () => [
    { path: work, worktree_path: null, branch: "main" },
    { path: other, worktree_path: other, branch: "feat/x" },
  ];
  const { gate } = gateOf({ cwd: work, sandbox, writeScope: { writableDirs: [], workplaces, allowed: new Set() } });
  const note = await gate.sandboxDeniedNote(`touch: ${other}/a.txt: Operation not permitted`);
  assert.match(note ?? "", /Kickoff の砂場が/);
  assert.match(note ?? "", /別の作業場所/);
  assert.equal(await gate.sandboxDeniedNote("Exit code 1"), null);
  assert.equal(await gateOf({ cwd: work }).gate.sandboxDeniedNote(`touch: ${other}/a.txt: Operation not permitted`), null);
});

test("承認カードを待つのをやめる合図: 渡した signal（Claude のフックの合図）でカードを待ち、省けば実行の signal", async () => {
  const signals: AbortSignal[] = [];
  const run = new AbortController().signal;
  const hook = new AbortController().signal;
  const requestApproval = async (_req: ApprovalRequest, signal: AbortSignal) => (signals.push(signal), { action: "allow" as const });
  const gate = toolGateFactory(undefined, sourcesOf({ dockerGuard: docker }))(testMaterials({ cwd: "/w" }), { requestApproval }, run);
  await gate.guard(bash("docker compose down"), { signal: hook });
  await gate.guard(bash("docker compose down"));
  assert.deepEqual([signals[0] === hook, signals[1] === run], [true, true]);
});

test("書き込み先の守り: OS の一時フォルダは Bash の砂場と同じく、Write・Edit でも聞かずに書ける（外のほかの場所は聞く）", async () => {
  const tmp = tempDir({ real: true });
  const rules = { tempDirs: [tmp], writableDirs: async () => [tmp], unsandboxedCommands: [] };
  const provider = new ScriptedProvider(async () => ({ status: "completed", sessionId: "s" }));
  const { store, runner, project, gateMaterials } = setupCore(provider, { bashSandbox: { rules, proxyPort: null, trashDir: null } });
  const chat = await runner.start({ projectId: project.id, prompt: "x" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  const scope = gateMaterials[0].writeScope;
  assert.ok(scope);
  const facts = { workdir: project.repo_path, writableDirs: scope.writableDirs, exceptionDirs: scope.exceptionDirs ?? [], memoryParents: [], workplaces: scope.workplaces };
  assert.equal((await judgeFileWrite(path.join(tmp, "perf", "check.ts"), facts)).kind, "pass");
  assert.equal((await judgeFileWrite(path.join(tempDir({ real: true }), "a.ts"), facts)).kind, "ask");
});
