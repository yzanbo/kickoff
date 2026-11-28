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
