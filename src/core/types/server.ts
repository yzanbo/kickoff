// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// コアのサーバーと GitHub CLI の状態
/** Kickoff サーバー（コア）の状態（画面の左下の接続の詳細） */
export interface ServerStatus {
  version: string;
  started_at: string;
  /** 待ち受けているアドレス（127.0.0.1 ならこの Mac からだけ） */
  host: string;
  port: number;
  /** スマホなど、ほかの端末からの接続を許可しているか */
  remote_enabled: boolean;
  /** max: 同時に実行するエージェント数の上限（null なら上限なし） */
  agents: { running: number; queued: number; max: number | null };
}

export interface GitHubStatus {
  installed: boolean;
  loggedIn: boolean;
  account?: string;
  detail: string;
}

/** 埋め込みブラウザの拡張機能（React DevTools など。メインプロセスと画面で同じ形） */
export interface BrowserExtensionInfo {
  name: string;
  version: string;
  path: string;
  source: "webstore" | "chrome-profile" | "folder";
}
