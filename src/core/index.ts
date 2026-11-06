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
import { MemoService } from "./memos/memos.js";
import type { DatabaseStats } from "./db/stats.js";

interface CoreOptions {
  dataDir: string;
  port: number;
  /** 127.0.0.1 なら Mac 内からのみ、0.0.0.0 なら LAN にも公開 */
  host?: string;
  staticDir?: string;
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
  if (recovered > 0) console.log(`[core] 中断された実行を ${recovered} 件復旧しました`);

  const token = loadOrCreateToken(opts.dataDir);
  // エージェントが自分（このプロセス・保存先・API）を壊さないよう、自分の情報を渡す
  const providers = createProviders(currentSelf(opts.dataDir, opts.port));
  // 使用枠は Claude のプランから取得する（Codex 対応時にプロバイダーごとに拡張する）
  const usage = new UsageMonitor(providers.claude, bus);
  // 設定の「使用状況」に並べる、ほかのサービス（Codex・Copilot・Cursor・Gemini）の使用状況
  const serviceUsage = new ServiceUsageMonitor(usage);
  const approvals = new ApprovalCenter(bus);
  const uploads = new UploadStore(path.join(opts.dataDir, "uploads"));
  // メモの親フォルダの既定は ~/Documents/<アプリ名> メモ（保存先のフォルダ名がアプリ名。開発版は「Kickoff Dev メモ」で、製品版のメモに触らない）
  const memos = new MemoService({
    store,
    defaultDir: path.join(os.homedir(), "Documents", `${path.basename(opts.dataDir)} メモ`),
    providers,
    publish: (e) => bus.publish(e),
  });
  // メモのチャットの実行では、AI にメモのフォルダも読み書きさせる
  const runner = new Runner({ store, approvals, providers, usage, uploads, bus, memoDirOf: (project) => memos.dirOf(project) });
  // 音声入力の文字起こし（モデルは保存先の models/ に置く。開発版と製品版で別）
  const voice = new VoiceService({ store, modelsDir: path.join(opts.dataDir, "models"), publish: (e) => bus.publish(e) });
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
    staticDir: opts.staticDir,
    listen: { host, port: opts.port },
  });

  // ポートが使われているなどで待ち受けられなければ、開いた DB を閉じてから伝える
  const server = await startHttpServer(app, { port: opts.port, host }).catch((e: unknown) => {
    store.close();
    throw e;
  });
  usage.start();
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
      stopAutoArchive();
      memos.close();
      await stopHttpServer(server);
      store.close();
    },
  };
}
