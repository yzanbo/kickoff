// コアの起動の値（CoreOptions）と、起動したコアの口（Core）。startCore と、コアのプロセスの入口（hostRun.ts）が読む
import type { Bus } from "@/foundation/core/bus";
import type { DatabaseStats } from "@/foundation/core/db/stats";
import type { RecoveredReason } from "@/foundation/core/host/protocol";
import type { HostPlatform } from "@/foundation/core/platform/types";
import type { ChildProcessNote } from "@/foundation/core/system/childProcesses";
import type { BrowserControl } from "@shared/browser/control";
import type { WorkerChannel } from "@/features/database/core/client";
import type { SecretCipher } from "@/features/database/core/secrets";
import type { DesktopNotify, PushSender } from "@/features/notifications/core/center";
import type { TerminalSessions } from "@/features/terminal/core/sessions";
import type { CorePlatformParts } from "./platform";

export interface CoreOptions {
  dataDir: string;
  port: number;
  /** 127.0.0.1 なら Mac 内からのみ、0.0.0.0 なら LAN にも公開 */
  host?: string;
  staticDir?: string;
  /** 埋め込みブラウザの操作（デスクトップアプリのメインプロセスが渡す。AI がブラウザのタブを見る・操作するツールに使う） */
  browser?: BrowserControl;
  /** 内蔵ターミナルのシェルに足す環境変数（どちらの Kickoff のターミナルか = KICKOFF_TERMINAL_OF。メインプロセス・daemon が渡す） */
  terminalEnv?: Record<string, string>;
  /** OS ごとに違う処理（機能に依らない口 = macosPlatform と、機能だけが使う値 = ./platform.ts の macosParts。コアのプロセス・daemon が作って渡す） */
  platform: HostPlatform;
  platformParts: CorePlatformParts;
  /** DB ワーカーを起動してつなぐ（Electron のアプリはメインが utilityProcess で out/main/dbWorker.js を起動する。渡さなければソースの worker/main.ts を node ＋ tsx で fork） */
  dbWorker?: () => WorkerChannel;
  /** DB のパスワードの暗号化（Electron の safeStorage。渡さなければ、暗号化せずに置く） */
  secretCipher?: SecretCipher;
  /** この Mac の通知を出す口（Mac のアプリのメインプロセスが渡す。出すかはコアが決める = notifications/center.ts。単体のコアにはない） */
  notify?: DesktopNotify;
  /** スマホのプッシュを送る口（省けば Expo Push = notifications/expoPush.ts。Web Push はまだ送らない） */
  push?: PushSender;
  /** Electron のメインプロセスの pid（コアのプロセスで動くとき。自分を守る仕組みとポートの一覧がメインも自分として扱う。省けば process.pid = 単体のコア・テスト） */
  hostPid?: number;
  /** 前のコアの終わり方（作業中のまま残ったチャットを中断にする文を選ぶ。省けばアプリの終了） */
  recoveredReason?: RecoveredReason;
  /** 起こした子プロセス（エージェントの CLI・DB ワーカーの子）の知らせ（コアのプロセスがメインへ送る。system/childProcesses.ts） */
  onChildProcess?: (note: ChildProcessNote) => void;
  /** 起動の段階（DB を開いた・待ち受けを始めた）の時刻を受ける（起動の時刻の記録） */
  onStage?: (stage: "dbOpened" | "listening") => void;
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
  /** 作業中のチャット（送る準備・親の会話を写している途中も。メインプロセスが、終了してよいかを聞くダイアログに名前を並べる） */
  runningChats(): { id: number; title: string | null }[];
  /** 作業中のチャットの数と、スマホ連携がオンか（メインプロセスが本体を眠らせないかを決める。変わったら bus の chat / settings が届く） */
  awakeNeeds(): { running: number; mobileEnabled: boolean };
  /** 内蔵ターミナルのシェル（この Mac の画面が消えたら、その持ち主のシェルを止める。コアのプロセスの入口が RPC から呼ぶ） */
  terminals: TerminalSessions;
  close(): Promise<void>;
}
