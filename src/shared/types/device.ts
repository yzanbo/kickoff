// スマホ連携の端末（この Mac の Kickoff を外から使うスマホなど）。トークンとプッシュの宛先は API に出さない

/** 端末ができること（full: 送る・答える・止めるなども / read: 見るだけ。つなぐときに Mac の画面で選び、あとで変えられる） */
export const DEVICE_ACCESSES = ["full", "read"] as const;
export type DeviceAccess = (typeof DEVICE_ACCESSES)[number];

export const DEVICE_ACCESS_LABELS: Record<DeviceAccess, string> = {
  full: "使える",
  read: "見るだけ",
};

/** できることの説明（マウスを乗せたとき） */
export const DEVICE_ACCESS_HELP: Record<DeviceAccess, string> = {
  full: "チャットを読む・送る・質問に答える・止めるができます",
  read: "チャットを読めますが、送る・答える・止めるはできません",
};

/** つないだ端末（設定の「スマホ連携」の一覧） */
export interface Device {
  id: number;
  /** 端末の名前（つなぐときに端末が名乗ったもの） */
  name: string;
  created_at: string;
  /** 最後に API を使った時刻（まだなら null。細かくは覚えない） */
  last_used_at: string | null;
  /** プッシュの宛先を登録したか（宛先そのものは出さない） */
  has_push: boolean;
  /** できること */
  access: DeviceAccess;
}

/** 端末のできることを変える本文（PATCH /api/devices/:id。この Mac の画面だけ） */
export interface DeviceUpdateBody {
  access: DeviceAccess;
}

/** つなぐときの本文（POST /api/pairing/requests/:id/approve。省けば full） */
export interface PairingApproveBody {
  access?: DeviceAccess;
}

/** プッシュの宛先（端末の表にだけ置く。Android のアプリは Expo Push、iPhone の Web は Web Push） */
export type DevicePush = { kind: "expo"; token: string } | { kind: "web"; endpoint: string; keys: { p256dh: string; auth: string } };

/** 端末に開いていない口を端末から呼んだときの 403 の印（スマホの画面が「Mac で操作してください」と出す） */
export const DEVICE_FORBIDDEN = "device_forbidden";

/** 「見るだけ」の端末が、見る以外の口を呼んだときの 403 の印 */
export const DEVICE_READ_ONLY = "device_read_only";

/** ペアリングの使い捨ての番号の有効な時間（5 分） */
export const PAIRING_CODE_TTL_MS = 5 * 60_000;

/** 端末からの「つなぎたい」の頼み（Mac の画面で「この端末をつなぎますか」と確かめる） */
export interface PairingRequest {
  id: string;
  /** 端末が名乗った名前 */
  name: string;
  created_at: string;
}

/** ペアリングの様子（この Mac の画面だけに出す。番号は端末に渡す前の使い捨て） */
export interface PairingState {
  /** 使い捨ての番号（始めていない・使い終えた・期限が切れたら null） */
  code: string | null;
  expires_at: string | null;
  /** 端末がつなぐ先（設定の mobile_url） */
  url: string | null;
  /** 本体の ID（database_id） */
  host_id: string;
  /** 確かめを待っている頼み（なければ null） */
  request: PairingRequest | null;
}

/** 端末が番号でつなぎたいと頼む本文（POST /pairing/claim。認証なし） */
export interface PairingClaimBody {
  code: string;
  name: string;
}

/** 頼みを受けた答え（secret は結果を聞くときに添える。端末だけが知る） */
export interface PairingClaimResult {
  request_id: string;
  secret: string;
  host_id: string;
}

/** 頼みの結果（POST /pairing/requests/:id。approved のときだけ端末のトークンを 1 回だけ渡す） */
export type PairingPollResult =
  | { status: "pending" }
  | { status: "approved"; token: string; device_id: number; host_id: string }
  | { status: "denied" }
  | { status: "expired" };

/**
 * いま見ているもの（PUT /api/viewing。この Mac の画面・端末がそれぞれ知らせる）。前に出ていなければ両方 null。
 * だれかが見ているチャット・CI のタブの知らせは、どこにも通知しない（見ているので要らない）
 */
export interface ViewingBody {
  /** 開いて前に出しているチャット */
  chat_id: number | null;
  /** 開いて前に出している CI のタブのプロジェクト */
  ci_project_id: number | null;
}

/** 見ているものの知らせを覚えておく時間（画面は前に出している間、これより短い間隔で知らせ直す） */
export const VIEWING_TTL_MS = 90_000;

/** スマホ連携がオフのときに、端末からの頼み・ペアリングを断る印 */
export const MOBILE_OFF = "mobile_off";
