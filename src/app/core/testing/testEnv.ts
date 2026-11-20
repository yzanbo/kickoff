// テストの外の世界の偽物（ネットワーク・外部コマンド・OS に出ない）と、それを本物と同じ組み立てに渡す CoreEnv。テストからだけ使う
import type { DevicePush } from "@shared/devices/types";
import type { GitHubAccount, GitHubRemote } from "@shared/git/types";
import { PROVIDER_IDS, type ProviderId } from "@shared/settings/types";
import type { HostPlatform } from "@/foundation/core/platform/types";
import { parseCwds, parseLsof } from "@/foundation/core/platform/macos/listening";
import { parsePs } from "@/foundation/core/platform/macos/processes";
import { fakeDocker } from "@/foundation/core/testing/fakeDocker";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { Invalid } from "@/foundation/core/errors";
import type { AgentProvider } from "@/features/ai/core/providers/types";
import { FakeProvider } from "@/features/ai/core/testing/fakeProvider";
import { ClaudeProvider } from "@/features/ai/core/providers/claude/provider";
import type { FakeClaudeSdk } from "@/foundation/core/testing/fakeClaudeSdk";
import type { UsageMonitor } from "@/features/ai/core/usage/planUsage";
import type { SecretCipher } from "@/features/database/core/secrets";
import { inProcessWorker } from "@/features/database/testing/inProcessWorker";
import { DockerCli } from "@/features/docker/core/cli";
import { macosDockerEngine } from "@/features/docker/core/macosEngine";
import type { BranchPullRequest, MergedPullRequest } from "@/features/github/core/github";
import type { GraphqlVars, RestResponse, WriteMethod } from "@/features/github/core/ghApi";
import { readGitHubRemotes, type GitHubTarget } from "@/features/github/core/githubTarget";
import type { PushResult } from "@/features/notifications/core/center";
import type { Notice } from "@/features/notifications/core/notices";
import type { FetchedImage } from "@/features/remoteImages/core/fetchImage";
import { fakeTerminals } from "@/features/terminal/core/testing/fakeTerminal";
import type { VoiceTools } from "@/features/voice/core/tools";
import type { AudioInput, LocalOptions, OpenAiOptions, OsSpeechStatus } from "@/features/voice/core/types";
import type { SpeechOptions } from "@/features/voice/core/speech";
import type { CoreEnv } from "@/app/core/types";

/** 使用枠は取れない（ネットワークに出ない）。超過分の知らせだけは本物と同じく覚え、動き始めたかを返す */
export function offlineUsage(): UsageMonitor {
  let inUse = false;
  const noteOverage = (next: boolean) => {
    const started = next && !inUse;
    inUse = next;
    return started;
  };
  return { get: async () => ({ available: false }), refresh: async () => ({ available: false }), noteOverage, start() {}, stop() {} } as unknown as UsageMonitor;
}

/** どのプロバイダーとして呼ばれても同じ偽物 */
export const sameProvider = <P extends AgentProvider>(provider: P) => Object.fromEntries(PROVIDER_IDS.map((id) => [id, provider])) as unknown as Record<ProviderId, AgentProvider>;

/** 偽物の一式（テストが答えを決め、呼ばれたものを見る）。dataDir は Kickoff 自身の保存先（DB クライアントのテストが dbFake.dataDir で見る） */
export function testFakes(dataDir: string) {
  const counts = { codex: 0 };
  return {
    provider: new FakeProvider(),
    counts,
    // 通信: online を false にすると AI の API に届かない（つながったかの確かめに使う）
    network: { online: true },
    // 音声入力: 文字起こしとコマンドの探し方・ダウンロードを偽物にする（呼ばれた方法と値を覚える）
    voiceFake: {
      tools: { whisper: "/fake/whisper-cli", ffmpeg: "/fake/ffmpeg" } as VoiceTools,
      /** macOS の音声認識の様子（確かめで返す） */
      speech: { helper: true, available: true, locale: "ja-JP", installed: true } as OsSpeechStatus,
      calls: [] as { engine: "local" | "macos" | "openai"; audio: AudioInput; opts: LocalOptions | { language: string } | OpenAiOptions }[],
      /** 読み上げを頼まれた文と値 */
      speeches: [] as { text: string; opts: SpeechOptions }[],
      /** ダウンロードで返す中身（Response を返す関数） */
      download: async (): Promise<Response> => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-length": "3" } }),
    },
    // ノート: 親フォルダの既定は一時フォルダ
    noteFake: { defaultDir: tempDir() },
    // Kickoff のゴミ箱の時計（trashClock.now で進める）
    trashClock: { now: Date.now() },
    // ワークツリーの PR の見張り: PR の一覧は偽物（prFake.prs を返し、聞いた回数を覚える。失敗させるなら fail）。マージ済みの PR は prFake.merged のブランチ → PR
    prFake: { prs: [] as BranchPullRequest[], asked: 0, fail: false, merged: {} as Record<string, MergedPullRequest> },
    // gh に入っている GitHub のアカウント（設定の「GitHub」。gh を呼ばない）
    githubFake: { accounts: [{ login: "me", active: true, ok: true }, { login: "work", active: false, ok: true }] as GitHubAccount[] },
    // GitHub タブ: 連携先と GitHub の答えは偽物（graphql / rest / pages を差し替える。聞いたものは calls に残る）
    ghFake: {
      target: { host: "github.com", repo: "o/r", headOwner: "o" } as GitHubTarget | null,
      /** GitHub の remote の一覧（null なら本物の git remote -v を読む） */
      remotes: null as GitHubRemote[] | null,
      calls: [] as { kind: "graphql" | "rest" | "pages" | "send" | "cli"; detail: string; vars?: GraphqlVars; etag?: string | null; method?: WriteMethod; body?: unknown }[],
      graphql: (_query: string, _vars: GraphqlVars): unknown => {
        throw new Error("GitHub の偽物に答えがありません");
      },
      rest: (_path: string, _etag: string | null): RestResponse => ({ status: 200, etag: '"e1"', body: [] }),
      pages: (_path: string): { items: unknown[]; truncated: boolean } => ({ items: [], truncated: false }),
      /** 書き込みの答え（断らせるなら Invalid を投げる） */
      send: (_method: WriteMethod, _path: string, _body: unknown): unknown => ({}),
      /** gh のコマンド（CI のログの gh run view）の標準出力 */
      cli: (_args: string[]): string => "",
    },
    // Docker タブ: 偽の docker（dockerFake.set で答えを決め、dockerFake.calls で呼ばれた引数を見る。docker が入っていない様子は dockerFake.missing）
    dockerFake: Object.assign(fakeDocker(), { missing: false }),
    // 静かなぶつかりの lsof・brew も偽物（portsFake.lsof に lsof の出力、brewServices に brew services info の JSON を入れる。止めた名前は brewStopped）。
    // ポートを使っているプロセスも同じ lsof の出力を読む（ps の出力は ps、作業フォルダの lsof -Fpn の出力は cwds、送ったシグナルは killed、まだ動いている pid は alive）
    portsFake: { lsof: "", brewServices: "[]", brewStopped: [] as string[], ps: "", cwds: "", killed: [] as { pid: number; signal: string }[], alive: new Set<number>() },
    // スマホ連携のペアリングの時計（pairingClock.now を進めて期限を試す）
    pairingClock: { now: Date.now() },
    // 通知: この Mac の通知とプッシュは偽物にして、出したものを覚える（notified / pushed。result で送った結果を差し替える。gone なら宛先を外す）
    notifyFake: { notified: [] as Notice[], pushed: [] as { push: DevicePush; title: string; body: string; host_id: string }[], result: "sent" as PushResult },
    // Tailscale: コマンドの場所（null なら入っていない。テストは答えを書いた小さなスクリプトを置く）
    tailscaleFake: { cli: null as string | null },
    // 内蔵ターミナル: シェルは偽物（terminalFake.spawned に作ったシェル）
    terminalFake: fakeTerminals(),
    // チャット欄の外の画像: 外へは取りに行かず、imageFake.images の URL → 画像を返す（なければ 400 の文。取った URL は imageFake.fetched）
    imageFake: { images: {} as Record<string, FetchedImage>, fetched: [] as string[] },
    // DB クライアント: Kickoff 自身の保存先と、製品版・開発版の保存先の親（OS の口の appDataRoot の代わり）
    dbFake: { dataDir, appDataRoot: tempDir() },
  };
}
export type TestFakes = ReturnType<typeof testFakes>;

/** OS の口（ポートとプロセスは portsFake を読む。アプリの本体は /dev/Electron.app/） */
export function testPlatform({ portsFake, dbFake }: TestFakes): HostPlatform {
  return {
    appDataRoot: dbFake.appDataRoot,
    startShellPath: () => ({ ready: Promise.resolve() }),
    openApp: async () => {},
    listeningSockets: async () => parseLsof(portsFake.lsof),
    processTable: async () => parsePs(portsFake.ps),
    processCwds: async () => parseCwds(portsFake.cwds),
    kill: (pid, signal) => void portsFake.killed.push({ pid, signal }),
    alive: (pid) => portsFake.alive.has(pid),
    appBundleOf: () => "/dev/Electron.app/",
  };
}

/**
 * 偽物を本物と同じ組み立てに渡す（いまのテストの振る舞いを保つ値: kickoff-trash を置かない・砂場と中継なし・ほかの Kickoff を調べない・確かめ直しは短く）。
 * claudeSdk を渡すと、claude だけ本物の ClaudeProvider にその偽の SDK を差し込む（API のテストでも Claude の実行の中身を通す）
 */
export function testEnv(f: TestFakes, { secretCipher = null, claudeSdk }: { secretCipher?: SecretCipher | null; claudeSdk?: FakeClaudeSdk } = {}): CoreEnv {
  return {
    platformParts: {
      speech: {
        check: async () => f.voiceFake.speech,
        transcribe: async (audio, language) => (f.voiceFake.calls.push({ engine: "macos", audio, opts: { language } }), "macOS の文"),
      },
      selfGuard: { killByName: /$^/, scripting: { pattern: /$^/, label: "" } },
      agentSandbox: { tempDirs: [], writableDirs: async () => [], unsandboxedCommands: [] },
      dockerEngine: macosDockerEngine(async () => {}),
      tailscaleCli: () => f.tailscaleFake.cli,
      terminalShell: () => ({ file: "/bin/sh", args: (c) => (c ? ["-c", c] : []) }),
    },
    secretCipher,
    hostPid: 1000,
    // テストは app.request で /mcp/<名前> を呼ぶので、URL の頭は使わない
    mcpBaseUrl: "http://127.0.0.1",
    ai: {
      providers: () => ({ ...sameProvider(f.provider), ...(claudeSdk ? { claude: new ClaudeProvider({ sdk: claudeSdk.sdk, executable: "claude" }) } : {}) }),
      usage: () => offlineUsage(),
      // ほかのサービスは、ネットワークに出ない偽物にする
      services: [
        {
          id: "codex",
          label: "Codex",
          fetch: async () => {
            f.counts.codex++;
            return { id: "codex", label: "Codex", status: "ok", plan: "plus", account: null, windows: [], notes: [], fetched_at: new Date().toISOString() };
          },
        },
        { id: "cursor", label: "Cursor", fetch: async () => Promise.reject(new Error("つながりません")) },
      ],
    },
    // 足す口のない偽のプロバイダーで「いま」を送るテストを待たせない・書き直している印は短い持ち時間にする（知らせが途絶えたら外れて送るのを確かめる）
    chat: { reconnect: { check: async () => f.network.online, intervalMs: 5 }, usageLimit: { checkMs: 5 }, editHoldTtlMs: 300, tellableWaitMs: 50, sessionsElsewhere: null },
    trash: { now: () => f.trashClock.now, installCommand: false, projectOfPath: (origin, projects) => projects.find((p) => origin === p.repo_path || origin.startsWith(`${p.repo_path}/`))?.id ?? null },
    notes: { defaultDir: f.noteFake.defaultDir },
    attachments: { dir: tempDir() },
    voice: {
      engines: {
        local: async (audio, opts) => (f.voiceFake.calls.push({ engine: "local", audio, opts }), "ローカルの文"),
        openai: async (audio, opts) => (f.voiceFake.calls.push({ engine: "openai", audio, opts }), "OpenAI の文"),
        speech: async (text, opts) => (f.voiceFake.speeches.push({ text, opts }), new Uint8Array([9, 8, 7])),
      },
      findTools: async () => f.voiceFake.tools,
      fetch: () => f.voiceFake.download(),
    },
    devices: { pairingNow: () => f.pairingClock.now },
    notifications: {
      notify: (n) => void f.notifyFake.notified.push(n),
      push: {
        send: async (push, m) => {
          f.notifyFake.pushed.push({ push, title: m.title, body: m.body, host_id: m.host_id });
          return f.notifyFake.result;
        },
      },
    },
    docker: {
      cli: new DockerCli(() => (f.dockerFake.missing ? null : f.dockerFake.bin)),
      portProbe: {
        listeningSockets: async () => parseLsof(f.portsFake.lsof),
        brewServices: async () => f.portsFake.brewServices,
        brewStop: async (name) => void f.portsFake.brewStopped.push(name),
      },
    },
    ports: { afterTurnMs: 20, stopWaitMs: 50 },
    terminal: { spawn: f.terminalFake.spawn },
    remoteImages: {
      fetcher: async (url) => {
        f.imageFake.fetched.push(url);
        const image = f.imageFake.images[url];
        if (!image) throw new Invalid("画像を読み込めませんでした（HTTP 404）");
        return image;
      },
    },
    github: {
      service: {
        resolveTarget: async () => f.ghFake.target,
        remotes: async (repo) => f.ghFake.remotes ?? (await readGitHubRemotes(repo)).remotes,
        api: () => ({
          graphql: async <T,>(query: string, vars: GraphqlVars) => {
            f.ghFake.calls.push({ kind: "graphql", detail: query, vars });
            return f.ghFake.graphql(query, vars) as T;
          },
          rest: async (path, o = {}) => {
            f.ghFake.calls.push({ kind: "rest", detail: path, etag: o.etag ?? null });
            return f.ghFake.rest(path, o.etag ?? null);
          },
          restPages: async (path) => {
            f.ghFake.calls.push({ kind: "pages", detail: path });
            return f.ghFake.pages(path);
          },
          send: async (method, path, body) => {
            f.ghFake.calls.push({ kind: "send", detail: path, method, body });
            return f.ghFake.send(method, path, body);
          },
          async cli(args) {
            f.ghFake.calls.push({ kind: "cli", detail: args.join(" ") });
            return f.ghFake.cli(args);
          },
        }),
      },
      // CI の結果（GitHub の答えは ghFake の rest・pages・cli。作業場所は本物の git）
      ci: { remotes: async (repo) => f.ghFake.remotes ?? (await readGitHubRemotes(repo)).remotes },
      // ワークツリーは本物の git。連携先は GitHub の o/r（手元のブランチも o にプッシュする）とみなす
      prWatch: {
        resolveTarget: async () => ({ host: "github.com", repo: "o/r", headOwner: "o" }),
        listPullRequests: async () => {
          f.prFake.asked++;
          if (f.prFake.fail) throw new Error("gh が見つかりません");
          return f.prFake.prs;
        },
      },
      accounts: async () => f.githubFake.accounts,
    },
    worktrees: { mergedPr: async (_project, branch) => f.prFake.merged[branch] ?? null },
    retryMs: 10,
    // DB クライアントは同じプロセスのワーカーで動かす（中身は本物と同じ）
    database: { worker: inProcessWorker, exportRoot: tempDir(), cleanExports: false },
    guard: { sandbox: false, relay: false },
  };
}
