import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOrCreateToken } from "./http/auth.js";
import { Bus } from "./bus.js";
import { startHttpServer, stopHttpServer } from "./http/httpServer.js";
import { createProviders } from "./providers/index.js";
import { currentSelf } from "./chat/guard/selfProtection.js";
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
import { adoptLegacyMemosDir, defaultMemosDir, legacyMemosDir, movedPath } from "./memos/defaultDir.js";
import type { DatabaseStats } from "./db/stats.js";
import type { BrowserControl } from "./browser/control.js";
import { DbWorkerClient, forkWorker, type WorkerChannel } from "./databases/client.js";
import { DatabaseService } from "./databases/service.js";
import { devWorkerEntry } from "./databases/entry.js";
import { DbSecretVault, migrateInBackground, type SecretCipher } from "./databases/secrets.js";

interface CoreOptions {
  dataDir: string;
  port: number;
  /** 127.0.0.1 なら Mac 内からのみ、0.0.0.0 なら LAN にも公開 */
  host?: string;
  staticDir?: string;
  /** 埋め込みブラウザの操作（デスクトップアプリのメインプロセスが渡す。AI がブラウザのタブを見る・操作するツールに使う） */
  browser?: BrowserControl;
  /** macOS の音声認識の補助コマンド（kickoff-speech）の場所（ビルドで out/native に作る。渡さなければ、音声入力の「macOS の音声認識」は使えない） */
  speechHelper?: string;
  /**
   * DB ワーカーを起動してつなぐ（Electron のアプリはメインプロセスが utilityProcess でビルドの out/main/dbWorker.js を起動する。
   * 渡さなければ、ソースの worker/main.ts を node ＋ tsx で fork する）
   */
  dbWorker?: () => WorkerChannel;
  /** DB のパスワードの暗号化（Electron の safeStorage。渡さなければ、暗号化せずに置く） */
  secretCipher?: SecretCipher;
}

export interface Core {
  port: number;
  token: string;
  localUrl: string;
  /** 変更の知らせ（性能の記録で、画面へ送った知らせ・つないでいる SSE を数える） */
  bus: Bus;
  /** 性能の記録（メインプロセスの診断）に載せる DB の様子（ファイルの大きさ・チャットと記録の数・記録の多いチャット） */
  databaseStats(): DatabaseStats;
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
  const providers = createProviders(currentSelf(opts.dataDir, opts.port));
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
  const memos = new MemoService({
    store,
    defaultDir: memosDefaultDir,
    providers,
    publish: (e) => bus.publish(e),
  });
  // DB クライアント（DB の処理は別のプロセス。初めて使ったときに起動し、何もしない状態が 5 分続いたら止める。チャットの AI にも DB のツールで読ませる）
  // DB のパスワードはキーチェーンの鍵で暗号化して置く（暗号化せずに置いていたものは、起動のときに一度だけ置き換える）
  const vault = new DbSecretVault(store, opts.secretCipher ?? null);
  migrateInBackground(vault);
  const databases = new DatabaseService({ store, client: new DbWorkerClient(opts.dbWorker ?? (() => forkWorker(devWorkerEntry()))), vault, dataDir: opts.dataDir });
  // AI の SQL の結果を書き出した CSV のうち、7 日を過ぎたもの・消したチャットのものを消す
  databases.cleanExports();
  // メモのチャットの実行では、AI にメモのフォルダも読み書きさせる
  // 作業の途中で止まったチャットは、起動したときの送信待ちの確かめで「中断した作業を続けてから送る」を選べる
  const runner = new Runner({ store, approvals, providers, usage, uploads, bus, memoDirOf: (project) => memos.dirOf(project), browser: opts.browser, databases, interrupted: recovered });
  // 音声入力の文字起こし（モデルは保存先の models/ に置く。開発版と製品版で別）
  const voice = new VoiceService({ store, modelsDir: path.join(opts.dataDir, "models"), speechHelper: opts.speechHelper ?? null, publish: (e) => bus.publish(e) });
  // ワークツリーの PR の見張り（GitHub でマージされた・閉じられたことを、5 分ごとと窓に戻ったときに確かめる）
  const prWatch = new WorktreePrWatch({ store, publish: (e) => bus.publish(e), listWorktrees, listPullRequests });
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
  // 完了したチャットの自動のアーカイブ（設定でオンにしたときだけ）
  const stopAutoArchive = startAutoArchive(store, bus);

  return {
    port: opts.port,
    token,
    localUrl: `http://127.0.0.1:${opts.port}`,
    bus,
    databaseStats: () => store.stats(),
    close: async () => {
      runner.shutdown();
      voice.downloads.stopAll();
      usage.stop();
      prWatch.stop();
      stopAutoArchive();
      memos.close();
      await databases.close();
      await stopHttpServer(server);
      store.close();
    },
  };
}
