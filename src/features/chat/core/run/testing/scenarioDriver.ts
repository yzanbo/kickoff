// 筋書きの表を、いまの Runner（偽物で本物と同じ組み立てを通したコア）に HTTP の口から流す。
// 待つのは「出来事が届いた」（実行が始まった・作業中でなくなった・見えるものが合った）で、決め打ちの時間では待たない。テストからだけ使う
import path from "node:path";
import { EDIT_HOLD_TTL_MS } from "@shared/chat/queueEditHolds";
import type { ChatDetail } from "@shared/chat/detail";
import type { RestartResume } from "@shared/chat/chatLive";
import { tick } from "@/foundation/core/testing/until";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { createTestCore, watchTools } from "@/app/core/testing/testCore";
import { testFakes, type TestFakes } from "@/app/core/testing/testEnv";
import { ScenarioProvider, type ScenarioRun } from "./scenarioProvider";
import { actual, assertMatches, matches, preCompactLabel, promptLabel, rowLabel, type Observed, type PromptTexts } from "./scenarioObserve";
import { providerStep, userStep } from "./scenarioSteps";
import { SESSIONS, T0, type ChatAlias, type Scenario, type ScenarioExpect, type ScenarioSettings, type ScenarioStep, type Then } from "./types";


type Core = ReturnType<typeof createTestCore>;

/** 表の 1 行を流して、最後に確かめる（timeoutMs: 待つ上限） */
export async function runScenario(s: Scenario, { timeoutMs = 3000 }: { timeoutMs?: number } = {}) {
  const d = new Driver(timeoutMs);
  if (s.settings) await d.settings(s.settings);
  if (s.git) gitRepo({ dir: d.core.project.repo_path, files: { "a.txt": "a\n" } });
  for (const step of s.steps) await d.step(step);
  await d.waitFor(async () => d.provider.active === 0 && (await d.idleAll()), "最後にすべての作業が終わる");
  assertMatches(s.expect, actual(s.expect, await d.observe(s.expect)));
}

export class Driver {
  readonly provider = new ScenarioProvider();
  private readonly fakes: TestFakes = testFakes(tempDir());
  private readonly dbFile = path.join(tempDir(), "kickoff.db");
  core: Core;
  watch: ReturnType<typeof watchTools>;
  readonly projectId: number;
  readonly chats = new Map<ChatAlias, number>();
  /** 行の名前 → ID・どちらの列か（消したあとも同じ行を指せるように覚える） */
  private readonly rows = new Map<string, { id: string; lane: "now" | "later" }>();
  readonly approvals = new Map<string, string>();
  private readonly owners = new Map<ScenarioRun, ChatAlias>();
  private readonly sinces = new Map<string, string>();
  /** 枠の戻りを見る時計（読んだ回数で、見張りが読んだかを知る）と、つながったかを確かめた回数 */
  private readonly clock = { now: T0, reads: 0 };
  private readonly net = { checks: 0 };
  /** 書き直しの印を立てているチャット（持ち時間を過ぎたら外す） */
  readonly editing = { now: new Set<ChatAlias>(), later: new Set<ChatAlias>() };
  private readonly texts: PromptTexts = { pre: new Set(), post: new Set() };

  constructor(private readonly timeoutMs: number) {
    this.core = this.assemble();
    this.watch = this.watchTools();
    this.projectId = this.core.project.id;
  }

  /** 組み立てる（起動し直しでも、同じ DB のファイル・偽物・プロバイダーを使う） */
  private assemble(): Core {
    return createTestCore({
      fakes: this.fakes,
      dbFile: this.dbFile,
      provider: this.provider,
      chat: {
        reconnect: {
          check: async () => (this.net.checks++, this.fakes.network.online),
          intervalMs: 5,
        },
        usageLimit: {
          now: () => (this.clock.reads++, this.clock.now),
          checkMs: 5,
        },
        // 持ち時間は時間では切れない長さにし、時計の出来事で外す
        editHoldTtlMs: 600_000,
      },
    });
  }

  /** AI の操作ツールを呼べるようにする（ツールが聞くカードには答えない。カードは筋書きが答える） */
  private watchTools() {
    const watch = watchTools(this.core, this.core.mcpTools);
    watch.answer(() => new Promise(() => {}));
    return watch;
  }

  async settings(patch: ScenarioSettings) {
    if (patch.pre_compact_prompt) this.texts.pre.add(patch.pre_compact_prompt.trim());
    if (patch.post_compact_prompt) this.texts.post.add(patch.post_compact_prompt.trim());
    this.status(await this.core.call("PUT", "/api/settings", patch), undefined);
  }

  id(alias: ChatAlias = "a"): number {
    const id = this.chats.get(alias);
    if (id === undefined) throw new Error(`筋書きの誤り: チャット ${alias} がない`);
    return id;
  }

  private aliasOf(chatId: number): ChatAlias {
    for (const [alias, id] of this.chats) if (id === chatId) return alias;
    throw new Error(`筋書きにないチャット ${chatId}`);
  }

  status(res: { status: number; body?: unknown }, want: number | undefined) {
    const ok = want === undefined ? res.status >= 200 && res.status < 300 : res.status === want;
    if (!ok) throw new Error(`状態コード ${res.status}（${want ?? "2xx"} のはず）: ${JSON.stringify(res.body)}`);
  }

  /** チャットの詳細（回答待ちのカードの ID は、答えたあとも同じカードを指せるように覚える） */
  async detail(alias: ChatAlias): Promise<ChatDetail> {
    const detail = (await this.core.call("GET", `/api/chats/${this.id(alias)}`)).body as ChatDetail;
    for (const a of detail.approvals) this.approvals.set(`${alias}:${a.kind}`, a.id);
    return detail;
  }

  /** 実行がどのチャットのものか（指示の ID の発言、なければ続きから再開した会話で見分ける） */
  private async ownerOf(run: ScenarioRun): Promise<ChatAlias | null> {
    const known = this.owners.get(run);
    if (known) return known;
    for (const alias of this.chats.keys()) {
      const { promptId, resumeSessionId } = run.params;
      const hit = promptId ? (await this.detail(alias)).events.some((e) => e.type === "user" && e.data.message_uuid === promptId) : resumeSessionId === SESSIONS[alias];
      if (hit) {
        this.owners.set(run, alias);
        return alias;
      }
    }
    return null;
  }

  async runsOf(alias: ChatAlias): Promise<ScenarioRun[]> {
    const out: ScenarioRun[] = [];
    for (const run of this.provider.runs) if ((await this.ownerOf(run)) === alias) out.push(run);
    return out;
  }

  /** そのチャットのいま動いている実行（なければ筋書きの誤り） */
  async current(alias: ChatAlias = "a"): Promise<ScenarioRun> {
    const run = (await this.runsOf(alias)).at(-1);
    if (!run || run.done) throw new Error(`筋書きの誤り: チャット ${alias} は動いていない`);
    return run;
  }

  /** 預かりを配っている途中か（送る準備の途中・いまの作業に足している途中。画面に出ない段取りなので中を見る。作り直したら、ここだけ直す） */
  private delivering(alias: ChatAlias): boolean {
    const phase = this.core.runner.state(this.id(alias))?.phase;
    return phase?.kind === "preparing" || (phase?.kind === "turn" && phase.telling !== null);
  }

  async idleAll(): Promise<boolean> {
    return [...this.chats.values()].every((id) => !this.core.runner.isBusy(id));
  }

  /** 条件を満たすまで待つ（上限を過ぎたら、何を待っていたかを添えて失敗） */
  async waitFor(cond: () => Promise<boolean>, what: string) {
    for (let i = 0; i < this.timeoutMs / 10; i++) {
      if (await cond()) return;
      await tick();
    }
    if (!(await cond())) throw new Error(`待ちきれませんでした: ${what}`);
  }

  /** 条件を満たすまで待つが、満たさなくても失敗にしない（満たしたか） */
  private async waitAWhile(cond: () => boolean, ms: number): Promise<boolean> {
    for (let i = 0; i < ms / 10 && !cond(); i++) await tick();
    return cond();
  }

  /** 出来事のあとに待つ（runsBefore: 出来事の前のそのチャットの実行の数） */
  async after(then: Then | undefined, alias: ChatAlias, runsBefore: number) {
    if (!then) return;
    const started = async () => {
      const runs = await this.runsOf(alias);
      return runs.length > runsBefore && !runs.at(-1)!.done;
    };
    const idle = async () => !this.core.runner.isBusy(this.id(alias));
    await this.waitFor(then === "turn" ? started : then === "idle" ? idle : async () => (await idle()) || (await started()), `${alias} が ${then}`);
  }

  async observe(want: ScenarioExpect): Promise<Observed> {
    const alias = want.chat ?? "a";
    const runs = await this.runsOf(alias);
    const restartResumes = "restartResumes" in want ? ((await this.core.call("GET", "/api/restart-resumes")).body as RestartResume[]) : undefined;
    return {
      detail: await this.detail(alias),
      texts: this.texts,
      runs: runs.map((r) => promptLabel(r.params.prompt, this.texts)),
      told: this.provider.told.filter((t) => runs.includes(t.run)).map((t) => promptLabel(t.text, this.texts)),
      preCompacts: runs.map((r) => preCompactLabel(r.params.preCompact, this.texts)),
      sessions: runs.map((r) => r.params.resumeSessionId),
      concurrent: this.provider.maxActive,
      busy: this.core.runner.isBusy(this.id(alias)),
      answers: this.provider.answers,
      restartResumes,
      sinceAlias: (since) => this.sinces.get(since) ?? (this.sinces.set(since, `t${this.sinces.size + 1}`), this.sinces.get(since)!),
      aliasOf: (chatId) => this.aliasOf(chatId),
    };
  }

  /** 行の ID とどちらの列か（いまの送信待ち・預かりから探し、なければ覚えたもの） */
  async row(alias: ChatAlias, label: string): Promise<{ id: string; lane: "now" | "later" }> {
    const { live } = await this.detail(alias);
    const found = live.queue.messages.find((m) => rowLabel(m) === label) ?? live.after_compact.find((m) => rowLabel(m) === label);
    if (found)
      this.rows.set(`${alias}:${label}`, {
        id: found.id,
        lane: live.queue.messages.includes(found) ? "later" : "now",
      });
    const row = this.rows.get(`${alias}:${label}`);
    if (!row) throw new Error(`筋書きの誤り: 行「${label}」がない`);
    return row;
  }

  async step(st: ScenarioStep): Promise<void> {
    if ("parallel" in st) {
      const seq = async (steps: ScenarioStep[]) => {
        for (const s of steps) await this.step(s);
      };
      return void (await Promise.all(st.parallel.map((s) => (Array.isArray(s) ? seq(s) : this.step(s)))));
    }
    if ("yield" in st) {
      for (let i = 0; i < st.yield; i++) await new Promise((r) => setImmediate(r));
      return;
    }
    if ("settle" in st) return this.waitFor(async () => !this.delivering(st.chat ?? "a"), "段取りが落ち着く");
    if ("await" in st) {
      const want = st.await;
      await this.waitFor(async () => matches(want, actual(want, await this.observe(want))), JSON.stringify(want)).catch(async () => assertMatches(want, actual(want, await this.observe(want))));
      return;
    }
    if ("check" in st) return assertMatches(st.check, actual(st.check, await this.observe(st.check)));
    if ("restart" in st) return this.restart();
    if ("provider" in st) return providerStep(this, st);
    if ("clock" in st || "net" in st) {
      const alias = st.chat ?? "a";
      const before = st.then ? (await this.runsOf(alias)).length : 0;
      await ("clock" in st ? this.advance(st.ms) : this.network(st.net));
      return this.after(st.then, alias, before);
    }
    const alias = ("chat" in st && st.chat) || "a";
    const before = st.do === "start" ? 0 : (await this.runsOf(alias)).length;
    await userStep(this, st, alias);
    await this.after("then" in st ? st.then : undefined, alias, before);
  }

  /** 時計を進める。書き直しの持ち時間を過ぎたら印を外し（いまの Runner の持ち時間の待ちが外すのと同じ）、枠の時計を見張っていれば読むまで待つ */
  private async advance(ms: number) {
    this.clock.now += ms;
    if (ms >= EDIT_HOLD_TTL_MS) {
      for (const lane of ["now", "later"] as const) {
        for (const alias of this.editing[lane]) await this.core.call("PUT", lane === "later" ? `/api/chats/${this.id(alias)}/queue/editing` : `/api/chats/${this.id(alias)}/after-compact/editing`, { ids: [] });
        this.editing[lane].clear();
      }
    }
    const reads = this.clock.reads;
    await this.waitAWhile(() => this.clock.reads > reads, 300);
  }

  /** 通信をつなぐ・切る。つながるのを待っているチャットがあれば、確かめるまで待つ */
  private async network(state: "online" | "offline") {
    const waiting = await Promise.all([...this.chats.keys()].map(async (a) => (await this.detail(a)).live.reconnect !== null));
    const checks = this.net.checks;
    this.fakes.network.online = state === "online";
    if (state === "online" && waiting.some(Boolean)) await this.waitFor(async () => this.net.checks > checks, "つながったかを確かめる");
  }

  /** アプリを終えて起動し直す（止めた実行が終わるのを待ってから、同じ DB のファイルで組み立て直す） */
  private async restart() {
    const old = this.core;
    old.runner.shutdown();
    await this.waitFor(async () => this.provider.active === 0 && [...this.chats.values()].every((id) => !old.runner.isBusy(id)), "止めた実行が終わる");
    this.core = this.assemble();
    this.watch = this.watchTools();
    this.editing.now.clear();
    this.editing.later.clear();
  }
}
