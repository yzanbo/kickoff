// コアの起動の値（CoreOptions）と、起動したコアの口（Core）。startCore と、コアのプロセスの入口（hostRun.ts）が読む
import type { Bus } from "@/foundation/core/bus";
import type { AppSettings } from "@shared/foundation/contract/settings";
import type { DatabaseStats } from "@shared/chat/databaseStats";
import type { RecoveredReason } from "@/foundation/core/host/protocol";
import type { HostPlatform } from "@/foundation/core/platform/types";
import type { ChildProcessNote } from "@/foundation/core/system/childProcesses";
import type { BrowserControl } from "@shared/browser/control";
import type { SecretCipher } from "@/features/database/core/secrets";
import type { DesktopNotify } from "@/features/notifications/core/index";
import type { PushSender } from "@/features/devices/core/push";
import type { TerminalApi, TerminalEnv } from "@/features/terminal/core/index";
import type { ChatRunPort } from "@/features/chat/core/index";
import type { CorePlatformParts } from "./platform";
import type { TrashEnv } from "@/features/trash/core/index";
import type { AiEnv } from "@/features/ai/core/index";
import type { AttachmentsEnv } from "@/features/attachments/core/index";
import type { DevicesEnv } from "@/features/devices/core/index";
import type { NotificationsEnv } from "@/features/notifications/core/index";
import type { VoiceEnv } from "@/features/voice/core/index";
import type { ChatEnv } from "@/features/chat/core/index";
import type { DockerEnv } from "@/features/docker/core/index";
import type { PortsEnv } from "@/features/ports/core/index";
import type { GitHubEnv } from "@/features/github/core/index";
import type { ChatImageServiceOptions } from "@/features/remoteImages/core/chatImageService";
import type { DatabaseEnv } from "@/features/database/core/index";
import type { WorkerChannel } from "@/features/database/core/index";
import type { SelfInfo } from "@/features/guard/core/guard/selfProtection";

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
  /** この Mac の通知を出す口（Mac のアプリのメインプロセスが渡す。出すかはコアが決める = notifications の center.ts。単体のコアにはない） */
  notify?: DesktopNotify;
  /** スマホのプッシュを送る口（省けば Expo Push = devices の push.ts。Web Push はまだ送らない） */
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
  runningChats(): { id: number; title: string }[];
  /** 作業中のチャットの数と、スマホ連携がオンか（メインプロセスが本体を眠らせないかを決める。変わったら turns の知らせか bus の settings が届く） */
  awakeNeeds(): { running: number; mobileEnabled: boolean };
  /** アプリの設定（メインプロセスの更新の仕組みが、自動で確かめるか・飛ばした版を読む） */
  settings(): AppSettings;
  /** チャットの作業を動かし始めた・1 回の実行が終わった知らせ（chat の殻） */
  turns: Pick<ChatRunPort, "onTurnStarted" | "onTurnEnded">;
  /** 内蔵ターミナルのシェル（この Mac の画面が消えたら、その持ち主のシェルを止める。コアのプロセスの入口が RPC から呼ぶ） */
  terminals: TerminalApi;
  close(): Promise<void>;
}

/**
 * 本物とテストで違う、外の世界の口。本物は realEnv.ts が CoreOptions から、テストは testing/testEnv.ts が偽物から作り、
 * どちらも同じ assembleCore を通る（省いた欄は本物の既定）
 */
export interface CoreEnv {
  /** 機能だけが使う OS の値 */
  platformParts: CorePlatformParts;
  recoveredReason?: RecoveredReason;
  /** DB のパスワード・AI の API キーの暗号化（null なら暗号化せずに置く） */
  secretCipher: SecretCipher | null;
  /** メインのプロセスの pid（自分を守る仕組みとポートの一覧が自分として扱う。省けば process.pid） */
  hostPid?: number;
  browser?: BrowserControl;
  /** AI の操作ツールの MCP の URL の頭（http://127.0.0.1:<ポート>） */
  mcpBaseUrl: string;
  /** 暗号化の口は secretCipher から渡す */
  ai: Omit<AiEnv, "secretCipher">;
  /** 前の終わり方・置いた kickoff-trash・MCP の URL は、ほかの欄から組み立てで渡す */
  chat: Omit<ChatEnv, "recoveredReason" | "trashCommandFile" | "mcpBaseUrl">;

  trash: TrashEnv & {
    /** AI の rm の代わりの kickoff-trash を bin/ に置くか */
    installCommand: boolean;
  };
  notes: { defaultDir: string };
  attachments: AttachmentsEnv;
  /** OS の音声認識は platformParts.speech */
  voice: Omit<VoiceEnv, "speech">;
  /** tailscale のコマンドの場所は platformParts.tailscaleCli */
  devices: Omit<DevicesEnv, "tailscaleCli">;
  notifications: NotificationsEnv;
  /** macOS のエンジンの起こし方は platformParts.dockerEngine */
  docker: Omit<DockerEnv, "engine">;
  /** 自分の pid は hostPid */
  ports: Omit<PortsEnv, "selfPid">;
  /** ログインのシェルは platformParts.terminalShell */
  terminal: Omit<TerminalEnv, "shell">;
  remoteImages: Pick<ChatImageServiceOptions, "fetcher">;
  github: GitHubEnv;
  /** 暗号化の口は secretCipher から渡す */
  database: Omit<DatabaseEnv, "secretCipher">;

  guard: {
    /** AI の Bash の砂場を付けるか */
    sandbox: boolean;
    /** Bash の通信の中継を起こすか（起こさなければプロバイダーの中継のまま） */
    relay: boolean;
    /** エージェントを動かしている Kickoff 自身（守りの門の自分を守る守り。テストは渡さない） */
    self?: SelfInfo;
  };
}

