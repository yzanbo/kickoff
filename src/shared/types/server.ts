// 型と定数のみ。Node 依存なし（コア・画面・将来のモバイルアプリで共有する）
// コアのサーバーと GitHub CLI の状態
import type { HostApiVersion } from "../api/version";

/** Kickoff サーバー（コア）の状態（画面の左下の接続の詳細）。API の版も添える（@shared/api/version） */
export interface ServerStatus extends HostApiVersion {
  version: string;
  started_at: string;
  /** 待ち受けているアドレス（127.0.0.1 ならこの Mac からだけ） */
  host: string;
  port: number;
  /** スマホなど、ほかの端末からの接続を許可しているか */
  remote_enabled: boolean;
  /** 作業中のチャットの数 */
  agents: { running: number };
  /** DB を作ったときに決めた ID（画面が覚えている ID 入りの表示の状態を、DB を作り直したら捨てる目印）。スマホ連携の本体の ID も兼ねる */
  database_id: string;
}

/** SSE（/api/events）の最初の行 hello（名前付きの知らせ。BusEvent とは別）: 本体の版・API の版・本体の ID */
export interface ServerHello extends HostApiVersion {
  core_version: string;
  host_id: string;
}

export interface GitHubStatus {
  installed: boolean;
  logged_in: boolean;
  account?: string;
  detail: string;
}
