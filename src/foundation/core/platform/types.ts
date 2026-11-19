// OS ごとに違う処理の口。コアはここを通して OS に触れ、OS ごとのコマンド・パスを散らさない（いまは macOS だけ。ほかの OS は同じ形で足す）。
// 機能だけが使う OS の値（音声認識・自分を守る決まり・砂場・Docker のエンジン・tailscale・ターミナルのシェル）は、その機能が型を持ち、
// 組み立て（@/app/core/platform.ts）が選んで渡す

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

/**
 * DB ワーカー（別のプロセス）が使う OS の口。ワーカーは関数を受け取れないので、HostPlatform には入れず、
 * ワーカーの入口（databases/worker/main.ts）が自分で選ぶ（ほかの OS を足すときは、そこと src/foundation/desktop/platform/index.ts で選び分ける）
 */
export interface ShellPlatform {
  /** コマンドの文を、利用者のログインシェルで流す起動の仕方（ターミナルと同じ設定で動かすため） */
  loginShell: (command: string) => { file: string; args: string[] };
  /** いま動いているプロセスの親子（親の pid → 子の pid の並び。読めなければ空） */
  childrenByParent: () => Map<number, number[]>;
}

/** OS ごとに違う処理（機能に依らない 9 つ） */
export interface HostPlatform {
  /** アプリの保存先を置く親のフォルダ（Electron の appData と同じ場所。製品版と開発版の保存先はこの下の名前で分ける） */
  appDataRoot: string;
  /**
   * GUI から起動したアプリはログインシェルの PATH を引き継がないので取り込む: 保存先に覚えた前回の値を先に入れ、読み直しは裏で流す。
   * ready は読み終わるか打ち切ったら解ける（外部コマンドを起こす所が待つ。system/exec.ts の waitForShellPath）
   */
  startShellPath: (dataDir: string) => { ready: Promise<void> };
  /** アプリを名前で開く（Docker のエンジンが止まっているときの「OrbStack を開く」など） */
  openApp: (name: string) => Promise<void>;
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
}

/** ポートを使っているプロセスを調べる・止めるのに使う口（テストでは偽物に差し替える） */
export type ProcessProbe = Pick<HostPlatform, "listeningSockets" | "processTable" | "processCwds" | "kill" | "alive">;
