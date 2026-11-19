// 製品版の画面の配信のキャッシュの決まり。
// /assets/ の下は Vite が名前に中身のハッシュを付けて書くので、1 年・変わらないとしてキャッシュさせる（V8 のコードキャッシュも効く）。
// ほか（index.html・favicon・SPA の index.html）は毎回問い合わせさせ、中身から作る ETag が同じなら 304 にする

/** 名前に中身のハッシュが付くファイルの Cache-Control（1 年は、変わらないファイルの慣例の最大の値） */
export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

/**
 * Vite が書き出したファイル（/assets/ の下）か。名前の形（-<ハッシュ>）では見分けない
 * （ハッシュの長さ・文字の決まりが変わったときに、黙って no-cache に落ちて効き目が消えるため。全件がハッシュ付きかはビルドで確かめる = `unhashedAssets`）
 */
export function isHashedAsset(path: string): boolean {
  return path.startsWith("/assets/");
}

/** 画面のファイルの Cache-Control（/assets/ の下は 1 年・変わらない、ほかは毎回確かめる） */
export function rendererCacheControl(path: string): string {
  return isHashedAsset(path) ? IMMUTABLE_CACHE : "no-cache";
}

/** Vite の既定の名前の形（[name]-[hash].[ext]。ハッシュは 8 文字） */
const HASHED_NAME = /-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;

/**
 * 画面のビルドの assets/ に書き出したファイルの名前のうち、中身のハッシュの形でないもの（ビルドを失敗にする。
 * public/assets/ に置いたファイルなど、ハッシュのないものが /assets/ に入ると、入れ替えたあとも古い中身を 1 年使い続けるため）
 */
export function unhashedAssets(names: readonly string[]): string[] {
  return names.filter((name) => !HASHED_NAME.test(name));
}
