// 配る場所（リポジトリ・版の一覧）。書くのは distribution.json の 1 か所（npm run publish も同じファイルを読む）。
// 版の一覧の場所は配ったあと変えない（配った版は古い場所を見続ける。electron-builder.yml の publish.url と同じで、publish が突き合わせる）
import distribution from "./distribution.json";

/** 本物の版を置く GitHub のリポジトリ（owner/name） */
export const RELEASE_REPO: string = distribution.repo;

/** Releases の一覧（入れられなかったときに、手で入れ直してもらうダウンロードのページ） */
export const RELEASES_URL = `https://github.com/${RELEASE_REPO}/releases`;

/** その版のリリースの説明（変わった点）のページ */
export const releaseNotesUrl = (version: string): string => `${RELEASES_URL}/tag/v${version}`;
