import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOrCreateToken } from "./http/auth.js";
import { Bus } from "./bus.js";
import { startHttpServer, stopHttpServer } from "./http/httpServer.js";
import { createProviders } from "./providers/index.js";
import { currentSelf } from "./chat/guard/selfProtection.js";
import type { HostPlatform } from "./platform/types.js";
import { PairingCenter } from "./devices/pairing.js";
import { NotificationCenter, type DesktopNotify, type PushSender } from "./notifications/center.js";
import { expoPushSender } from "./notifications/expoPush.js";
import { ViewingRegistry } from "./notifications/viewing.js";
import { BrowserLogin } from "./http/browserLogin.js";
import { createApp } from "./http/server.js";
import { Store } from "./db/store.js";
import { DB_FILE, discardPrereleaseData } from "./db/open.js";
import { ServiceUsageMonitor } from "./usage/services/index.js";
import { UsageMonitor } from "./usage/planUsage.js";
import { ApprovalCenter } from "./chat/approvals.js";
import { Runner } from "./chat/runner.js";
import { UploadStore } from "./chat/uploads.js";
import { startAutoArchive } from "./chat/autoArchive.js";
import { VoiceService } from "./voice/service.js";
import { WorktreePrWatch } from "./git/prWatch.js";
import { listPullRequests } from "./git/github.js";
import { listWorktrees } from "./git/worktrees.js";
import { MemoService } from "./memos/memos.js";
import { errorMessage } from "@shared/errors";
import { TrashService } from "./trash/service.js";
import { installTrashCommand } from "./trash/command.js";
import { registerChatTrash, trashMemoChats, trashMemoChatsOnImport } from "./trash/chatTrash.js";
import { isInside, realPathLoose } from "./system/paths.js";
import { adoptLegacyMemosDir, defaultMemosDir, legacyMemosDir, movedPath } from "./memos/defaultDir.js";
import type { DatabaseStats } from "./db/stats.js";
import type { BrowserControl } from "./browser/control.js";
import { TerminalSessions } from "./terminal/sessions.js";
import { DbWorkerClient, forkWorker, type WorkerChannel } from "./databases/client.js";
import { DatabaseService } from "./databases/service.js";
import { GitHubService } from "./github/service.js";
import { CiService } from "./github/ci.js";
import { devWorkerEntry } from "./databases/entry.js";
import { DbSecretVault, migrateInBackground, type SecretCipher } from "./databases/secrets.js";
import { stopAllStreams } from "./system/stream.js";
import { DockerService } from "./docker/service.js";
import { WorktreeEnvService } from "./worktreeEnv/service.js";
import { PortProcessService } from "./ports/service.js";
import { PortWatch } from "./ports/watch.js";

interface CoreOptions {
  dataDir: string;
  port: number;
  /** 127.0.0.1 なら Mac 内からのみ、0.0.0.0 なら LAN にも公開 */
  host?: string;
  staticDir?: string;
  /** 埋め込みブラウザの操作（デスクトップアプリのメインプロセスが渡す。AI がブラウザのタブを見る・操作するツールに使う） */
  browser?: BrowserControl;
  /** 内蔵ターミナルのシェルに足す環境変数（どちらの Kickoff のターミナルか = KICKOFF_TERMINAL_OF。メインプロセス・daemon が渡す） */
  terminalEnv?: Record<string, string>;
  /** OS ごとに違う処理（ゴミ箱・ポートを待っているプロセス・音声認識など。いまは platform/macos の macosPlatform。メインプロセス・daemon が作って渡す） */
  platform: HostPlatform;
  /**
   * DB ワーカーを起動してつなぐ（Electron のアプリはメインプロセスが utilityProcess でビルドの out/main/dbWorker.js を起動する。
   * 渡さなければ、ソースの worker/main.ts を node ＋ tsx で fork する）
   */
  dbWorker?: () => WorkerChannel;
  /** DB のパスワードの暗号化（Electron の safeStorage。渡さなければ、暗号化せずに置く） */
  secretCipher?: SecretCipher;
  /** この Mac の通知を出す口（Mac のアプリのメインプロセスが渡す。出すかはコアが決める = notifications/center.ts。単体のコアにはない） */
  notify?: DesktopNotify;
  /** スマホのプッシュを送る口（省けば Expo Push = notifications/expoPush.ts。Web Push はまだ送らない） */
  push?: PushSender;
}

export interface Core {
  port: number;
  token: string;
  localUrl: string;
  /** 変更の知らせ（性能の記録で、画面へ送った知らせ・つないでいる SSE を数える） */
  bus: Bus;
  /** 性能の記録（メインプロセスの診断）に載せる DB の様子（ファイルの大きさ・チャットと記録の数・記録の多いチャット） */
  databaseStats(): DatabaseStats;
  /** ブラウザからこの Mac の画面として入る、一度だけ使える URL（npm run daemon が端末に出す） */
  browserLoginUrl(): string;
  /** 作業中のチャットの数と、スマホ連携がオンか（メインプロセスが本体を眠らせないかを決める。変わったら bus の chat / settings が届く） */
  awakeNeeds(): { running: number; mobileEnabled: boolean };
  /** 内蔵ターミナルのシェル（メインプロセスが、この Mac の画面の IPC をここへつなぐ） */
  terminals: TerminalSessions;
  close(): Promise<void>;
}

/** Kickoff のコア（DB・エージェント実行・HTTP API）を起動する。Electron にもヘッドレスにも依存しない */
export async function startCore(opts: CoreOptions): Promise<Core> {
  fs.mkdirSync(opts.dataDir, { recursive: true });
  const bus = new Bus();
  if (discardPrereleaseData(opts.dataDir)) console.log("[core] リリース前の版の保存データ（データベース・backups・uploads）を消し、新しく作り直しました");
  const store = new Store(path.join(opts.dataDir, DB_FILE), (e) => bus.publish(e));
  const recovered = store.chats.recoverInterrupted("アプリの終了により中断しました。メッセージを送ると続きから再開できます。");
  if (recovered.length > 0) console.log(`[core] 中断された実行を ${recovered.length} 件復旧しました`);

  const token = loadOrCreateToken(opts.dataDir);
  // エージェントが自分（このプロセス・保存先・API）を壊さないよう、自分の情報を渡す
  const providers = createProviders(currentSelf(opts.dataDir, opts.port, opts.platform));
  // 使用枠は Claude のプランから取得する（Codex 対応時にプロバイダーごとに拡張する）
  const usage = new UsageMonitor(providers.claude, bus);
  // 設定の「使用状況」に並べる、ほかのサービス（Codex・Copilot・Cursor・Gemini）の使用状況
  const serviceUsage = new ServiceUsageMonitor(usage);
  const approvals = new ApprovalCenter(bus);
  const uploads = new UploadStore(path.join(opts.dataDir, "uploads"));
  // メモの親フォルダの既定は ~/Documents/kickoff（保存先のフォルダ名のアプリ名を空白のない小文字に。開発版は kickoff-dev で、製品版のメモに触らない）。
  // 既定のまま使っていて、前の既定（~/Documents/<アプリ名> メモ）にメモがあれば、そのフォルダを新しい名前にして引き継ぐ
  const documentsDir = path.join(os.homedir(), "Documents");
  const memosDefaultDir = defaultMemosDir(opts.dataDir, documentsDir);
  const legacyDir = legacyMemosDir(opts.dataDir, documentsDir);
  if (store.settings.get().memos_dir === null && adoptLegacyMemosDir(legacyDir, memosDefaultDir)) {
    // そのプロジェクトだけの場所（memo_path）で前のフォルダの中を指していたものも付け替える
    for (const project of store.projects.list()) {
      const moved = project.memo_path ? movedPath(project.memo_path, legacyDir, memosDefaultDir) : null;
      if (moved) store.projects.update(project.id, { memo_path: moved });
    }
    console.log(`[core] メモのフォルダを ${memosDefaultDir} に移しました`);
  }
  // Kickoff のゴミ箱（消したものを 3 日取っておく。起動したときと 1 時間ごとに、期限の来たものを本当に消す）。
  // AI の kickoff-trash で入れたものは、消したチャットのプロジェクト、なければ元の場所を含むプロジェクト（本体・メモのフォルダ）のゴミ箱に出す
  const trashBin = new TrashService({
    store,
    dir: path.join(opts.dataDir, "trash"),
    projectOfPath: (origin) => {
      const owner = store.projects.list().find((p) => isInside(realPathLoose(p.repo_path), origin) || ((p.memo_path || p.memo_folder) && isInside(realPathLoose(memos.dirOf(p)), origin)));
      return owner?.id ?? null;
    },
    // AI がメモを kickoff-trash で消したら、メモのチャットも同じ行に入れる（画面から消したときと同じ）
    onImported: (item) => trashMemoChatsOnImport({ store, runner, memoDirOf: (p) => memos.dirOf(p), publish: (e) => bus.publish(e) }, item),
  });
  const memos = new MemoService({
    store,
    defaultDir: memosDefaultDir,
    providers,
    publish: (e) => bus.publish(e),
    trashBin,
    trashMemoChats: (projectId, memoPath, itemId) => trashMemoChats({ store, runner }, projectId, memoPath, itemId),
  });
  // DB クライアント（DB の処理は別のプロセス。初めて使ったときに起動し、何もしない状態が 5 分続いたら止める。チャットの AI にも DB のツールで読ませる）
  // DB のパスワードはキーチェーンの鍵で暗号化して置く（暗号化せずに置いていたものは、起動のときに一度だけ置き換える）
  const vault = new DbSecretVault(store, opts.secretCipher ?? null);
  migrateInBackground(vault);
  const databases = new DatabaseService({ store, client: new DbWorkerClient(opts.dbWorker ?? (() => forkWorker(devWorkerEntry()))), vault, dataDir: opts.dataDir, appDataRoot: opts.platform.appDataRoot, publish: (e) => bus.publish(e) });
  // AI の SQL の結果を書き出した CSV のうち、7 日を過ぎたもの・消したチャットのものを消す
  databases.cleanExports();
  // メモのチャットの実行では、AI にメモのフォルダも読み書きさせる
  // 作業の途中で止まったチャットは、起動したときの送信待ちの確かめで「中断した作業を続けてから送る」を選べる
  // Docker タブ（docker events は見ている画面があるときだけ動かす。チャットの AI の Docker の守りも、これで相手を引く）
  const docker = new DockerService(bus, opts.platform);
  // ワークツリーの実行環境（ワークツリーを作ったときにポートの帯と組の名前を割り当てる。チャットの AI とターミナルには PORT を渡す）
  const worktreeEnvs = new WorktreeEnvService(store, docker);
  // ポートを使っているプロセス（AI が残した開発サーバーに気付いて止める。調べるのは窓を開いた・チャットの実行が終わったときだけ）
  const ports = new PortWatch(bus, new PortProcessService({ store, probe: opts.platform, selfBundle: opts.platform.appBundleOf(process.execPath) }));
  // 内蔵ターミナルのシェル（この Mac の画面は IPC、スマホは WebSocket でつなぐ。ワークツリーのシェルには PORT を渡す。AI は出力を読むだけ）
  const terminals = new TerminalSessions({ shell: opts.platform.terminalShell(), env: opts.terminalEnv, envOf: (cwd) => worktreeEnvs.envFor(cwd) });
  // AI の rm の代わりの kickoff-trash を bin/ に置く（置けなければ守りも付けない。AI が消せなくなって止まらないように）
  const trashCommand = await installTrashCommand(path.join(opts.dataDir, "bin")).then(
    (file) => ({ path: file, dir: trashBin.dir }),
    (e: unknown) => (console.warn(`[core] kickoff-trash を置けませんでした: ${errorMessage(e)}`), undefined),
  );
  const runner = new Runner({ store, approvals, providers, usage, uploads, bus, memoDirOf: (project) => memos.dirOf(project), memos, browser: opts.browser, terminals, databases, docker, worktreeEnvs, trashCommand, interrupted: recovered });
  // ゴミ箱に入れたチャット（チャットの削除・メモのチャット）を戻す・3 日たったら会話記録のファイル・添付・AI の SQL の CSV ごと本当に消す
  registerChatTrash(trashBin, { store, providers, uploads, forgetChatExports: (ids) => databases.forgetChatExports(ids) });
  // 音声入力の文字起こし（モデルは保存先の models/ に置く。開発版と製品版で別）
  const voice = new VoiceService({ store, modelsDir: path.join(opts.dataDir, "models"), speech: opts.platform.speech, publish: (e) => bus.publish(e) });
  // GitHub タブと CI の結果（GitHub Actions）
  const github = new GitHubService({ onWorktreeCreated: (project, worktree) => worktreeEnvs.prepare(project, worktree) });
  const ci = new CiService(github);
  // ワークツリーの PR の見張り（GitHub でマージされた・閉じられたことを、5 分ごとと窓に戻ったときに確かめる）。
  // CI の失敗の見張りも相乗りする（ワークツリーのないプロジェクトでも。落ちたら SSE の ci_failed）
  const prWatch = new WorktreePrWatch({
    store,
    publish: (e) => bus.publish(e),
    listWorktrees,
    listPullRequests,
    alsoCheck: async (project) => {
      for (const failure of await ci.watch(project, store)) bus.publish({ type: "ci_failed", failure });
    },
  });
  // スマホ連携のペアリング（番号と頼みはメモリだけ）
  const pairing = new PairingCenter({ store, publish: (e) => bus.publish(e) });
  // 通知の判断（完了・失敗・回答待ち・CI の失敗を、だれも見ていなければ、この Mac の通知とつないだ端末のプッシュへ）
  const viewing = new ViewingRegistry();
  const browserLogin = new BrowserLogin();
  const notifications = new NotificationCenter({ bus, store, viewing, desktop: opts.notify, push: opts.push ?? expoPushSender() });
  const host = opts.host ?? "127.0.0.1";
  const app = createApp({
    store,
    bus,
    token,
    providers,
    usage,
    serviceUsage,
    runner,
    approvals,
    uploads,
    voice,
    memos,
    prWatch,
    databases,
    github,
    ci,
    docker,
    worktreeEnvs,
    ports,
    pairing,
    viewing,
    browserLogin,
    trash: opts.platform.moveToTrash,
    trashBin,
    tailscaleCli: opts.platform.tailscaleCli,
    terminals,
    staticDir: opts.staticDir,
    listen: { host, port: opts.port },
  });

  // ポートが使われているなどで待ち受けられなければ、開いた DB を閉じてから伝える
  const server = await startHttpServer(app, { port: opts.port, host }).catch((e: unknown) => {
    store.close();
    throw e;
  });
  usage.start();
  prWatch.start();
  ports.start();
  trashBin.start();
  // 完了したチャットの自動のアーカイブ（設定でオンにしたときだけ）
  const stopAutoArchive = startAutoArchive(store, bus);

  return {
    port: opts.port,
    token,
    localUrl: `http://127.0.0.1:${opts.port}`,
    bus,
    databaseStats: () => store.stats(),
    awakeNeeds: () => ({ running: runner.stats().running, mobileEnabled: store.settings.get().remote_enabled }),
    browserLoginUrl: () => `http://127.0.0.1:${opts.port}/login?code=${browserLogin.issue()}`,
    terminals,
    close: async () => {
      // 止める途中の知らせで通知を出さない
      notifications.close();
      runner.shutdown();
      // 流れ続けている外部コマンド（docker events・起動の途中の up -d など）は聞かずに止める
      stopAllStreams();
      docker.close();
      voice.downloads.stopAll();
      usage.stop();
      prWatch.stop();
      ports.close();
      stopAutoArchive();
      trashBin.close();
      memos.close();
      await databases.close();
      terminals.closeAll();
      await stopHttpServer(server);
      store.close();
    },
  };
}
