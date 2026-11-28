// 版の番号と作り方の取り決め（メインが持ち、画面は IPC の updates.build で受ける）

/**
 * 作り方: release = 配った版（npm run publish）/ local = 手元ビルド（npm run install-app。金庫の印鑑）/
 * adhoc = 印鑑なしの手元ビルド（ADHOC=1 npm run install-app）/ dev = 開発版・ふつうのビルド（npm run build）
 */
export const BUILD_KINDS = ["release", "local", "adhoc", "dev"] as const;
export type BuildKind = (typeof BUILD_KINDS)[number];

/** 作り方の添え書き（配った版は添えない） */
export const BUILD_KIND_LABELS: Record<BuildKind, string | null> = {
  release: null,
  local: "手元ビルド",
  adhoc: "手元ビルド・印鑑なし",
  dev: "開発版",
};

/** ビルドのときに入れる値（scripts/build-stamp.mjs が作り、メインのコードに埋め込む） */
export interface BuildStamp {
  /** コミットの数（rev-list --count HEAD。リポジトリの外で作ったら null） */
  buildNumber: number | null;
  /** 短い SHA（リポジトリの外で作ったら null） */
  commit: string | null;
  kind: BuildKind;
}

/** 画面に出す版の情報 */
export interface BuildInfo extends BuildStamp {
  /** package.json の version（semver） */
  version: string;
}

/**
 * 更新の様子（メインが持ち、画面へ updates.onState で知らせる）。
 * checking・latest・unreachable は手で確かめたときだけ（自動の確かめでは帯を出さない）。previous は確かめる前の様子（つながらなければ戻す）
 */
export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking"; previous: UpdateState }
  | { kind: "latest" }
  | { kind: "unreachable" }
  | { kind: "downloading"; version: string; percent: number }
  | { kind: "ready"; version: string }
  /** 作業中のチャットがあるので、終わったら開き直す（running は作業中の数） */
  | { kind: "waiting"; version: string; running: number }
  | { kind: "installing"; version: string }
  /** 入れられなかった（印鑑が違う・置き場所に書けないなど） */
  | { kind: "failed"; version: string };

/** 画面に渡す更新のまとめ */
export interface UpdatesSnapshot {
  build: BuildInfo;
  /** この版で更新を確かめるか（印鑑で署名した製品版だけ。開発版・印鑑なしの版は確かめない） */
  supported: boolean;
  state: UpdateState;
}

/** 更新の設定のうちメインが読む所（コアのアプリの設定 auto_check_updates・skipped_update_version。RPC の updates.settings） */
export interface UpdatePrefs {
  autoCheck: boolean;
  skippedVersion: string | null;
}
