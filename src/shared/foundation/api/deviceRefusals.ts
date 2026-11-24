// 認証が端末（スマホ）の頼みを 403 で断るときの印と文。コアの認証が返し、スマホの画面が印で文を出し分ける（値は端末との取り決めなので変えない）

/** 端末に開いていない口を端末から呼んだときの 403 の印（スマホの画面が「Mac で操作してください」と出す） */
export const DEVICE_FORBIDDEN = "device_forbidden";

/** 「見るだけ」の端末が、見る以外の口を呼んだときの 403 の印 */
export const DEVICE_READ_ONLY = "device_read_only";

/** スマホ連携がオフのときに、端末からの頼み・ペアリングを断る印 */
export const MOBILE_DISABLED = "mobile_off";
/** スマホ連携がオフのときの断りの文 */
export const MOBILE_DISABLED_MESSAGE = "スマホ連携がオフです。Mac の Kickoff の設定「スマホ連携」でオンにしてください";
