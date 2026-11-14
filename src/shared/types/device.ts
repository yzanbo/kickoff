// スマホ連携の端末（この Mac の Kickoff を外から使うスマホなど）。トークンとプッシュの宛先は API に出さない

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
}

/** プッシュの宛先（端末の表にだけ置く。Android のアプリは Expo Push、iPhone の Web は Web Push） */
export type DevicePush = { kind: "expo"; token: string } | { kind: "web"; endpoint: string; keys: { p256dh: string; auth: string } };

/** 端末に開いていない口を端末から呼んだときの 403 の印（スマホの画面が「Mac で操作してください」と出す） */
export const DEVICE_FORBIDDEN = "device_forbidden";

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
