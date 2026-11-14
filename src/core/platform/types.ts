// OS ごとに違う処理の口。コアはここを通して OS に触れ、OS ごとのコマンド・パスを散らさない（いまは macOS だけ。ほかの OS は同じ形で足す）
import type { DockerEngineStarter, VoiceStatus } from "@shared/types";
import type { AudioInput } from "../voice/types.js";

/** TCP のポートを待っているソケット 1 つ */
export interface ListeningSocket {
  /** プロセスの名前 */
  process: string;
  pid: number;
  /** 127.0.0.1:5432・*:5432・[::1]:5432 など（OS のコマンドに出たまま） */
  address: string;
  port: number;
}

/** プロセスの表の 1 行 */
export interface ProcessRow {
  pid: number;
  /** 親の pid */
  ppid: number;
  /** 動いている時間（秒。読めなければ null） */
  elapsed: number | null;
  /** コマンド（引数まで。改行は空白に） */
  command: string;
}

/** OS の音声認識の様子（画面に出す形） */
export type OsSpeechStatus = VoiceStatus["macos"];

/** OS の音声認識（使えない OS では、check が helper: false を返す） */
export interface OsSpeech {
  /** この言語で使えるか（言語は設定の値のまま） */
  check: (language: string) => Promise<OsSpeechStatus>;
  /** 音声を文にする（失敗したら 400） */
  transcribe: (audio: AudioInput, language: string) => Promise<string>;
}

/** 自分を守る仕組み（chat/guard/selfProtection.ts）が見分ける、OS ごとのプロセスを止める・操作するコマンド */
export interface SelfGuardRules {
  /** 名前でまとめて止めるコマンド（macOS は pkill・killall） */
  killByName: RegExp;
  /** アプリを外から操作する手段と、断るときの呼び名（macOS は osascript = AppleScript） */
  scripting: { pattern: RegExp; label: string };
}

/** Docker のエンジンが止まっているときの起こし方（ボタンで開くアプリ・コピーするコマンド） */
export interface DockerEngineStarters {
  /** いまの context の名前から、画面に出す起こし方（分からなければ null） */
  starterOf: (context: string | null) => DockerEngineStarter;
  /** 起こし方が「アプリを開く」のとき、エンジンを起こす（起きるまでは待たない。画面が調べ直す） */
  start: (starter: Extract<DockerEngineStarter, { kind: "open" }>) => Promise<void>;
}

/**
 * DB ワーカー（別のプロセス）が使う OS の口。ワーカーは関数を受け取れないので、HostPlatform には入れず、
 * ワーカーの入口（databases/worker/main.ts）が自分で選ぶ（ほかの OS を足すときは、そこと src/main/platform/index.ts で選び分ける）
 */
export interface ShellPlatform {
  /** コマンドの文を、利用者のログインシェルで流す起動の仕方（ターミナルと同じ設定で動かすため） */
  loginShell: (command: string) => { file: string; args: string[] };
  /** いま動いているプロセスの親子（親の pid → 子の pid の並び。読めなければ空） */
  childrenByParent: () => Map<number, number[]>;
}

/** OS ごとに違う処理 */
export interface HostPlatform {
  /** アプリの保存先を置く親のフォルダ（Electron の appData と同じ場所。製品版と開発版の保存先はこの下の名前で分ける） */
  appDataRoot: string;
  /** GUI から起動したアプリはログインシェルの PATH を引き継がないので、取り込んで process.env.PATH に足す */
  loadLoginShellPath: () => void;
  /** アプリを名前で開く（Docker のエンジンが止まっているときの「OrbStack を開く」など） */
  openApp: (name: string) => Promise<void>;
  /** ゴミ箱へ移す（元に戻せる） */
  moveToTrash: (file: string) => Promise<void>;
  /** TCP のポートを待っているソケット（自分のユーザーのプロセスだけ） */
  listeningSockets: () => Promise<ListeningSocket[]>;
  /** プロセスの表（pid → 行） */
  processTable: () => Promise<Map<number, ProcessRow>>;
  /** プロセスの作業フォルダ（pid → フォルダ。読めないものは入らない） */
  processCwds: (pids: number[]) => Promise<Map<number, string>>;
  /** シグナルを送る */
  kill: (pid: number, signal: "SIGTERM" | "SIGKILL") => void;
  /** まだ動いているか */
  alive: (pid: number) => boolean;
  /** 実行ファイルのパスから、アプリの本体のフォルダ（末尾の / まで。アプリの本体の中でなければ null） */
  appBundleOf: (execPath: string) => string | null;
  /** OS の音声認識 */
  speech: OsSpeech;
  /** 自分（エージェントを動かしている Kickoff）を止めるコマンドの見分け方 */
  selfGuard: SelfGuardRules;
  /** Docker のエンジンの起こし方 */
  dockerEngine: DockerEngineStarters;
  /** tailscale のコマンドの場所（入っていなければ null。設定の「スマホ連携」の Tailscale Serve の案内） */
  tailscaleCli: () => string | null;
}

/** ポートを使っているプロセスを調べる・止めるのに使う口（テストでは偽物に差し替える） */
export type ProcessProbe = Pick<HostPlatform, "listeningSockets" | "processTable" | "processCwds" | "kill" | "alive">;
