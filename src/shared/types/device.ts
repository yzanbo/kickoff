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
