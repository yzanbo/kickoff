// 返答の Markdown の画像の見分け（メモの仕様書「0027_チャット欄の外の画像とリンク」）。コアの画像の口と画面の画像の部品で同じ決まりを使う

/** 外の画像（http・https の URL）。host はポートがあれば「:ポート」付きの小文字（許可を覚える単位） */
export interface RemoteImage {
  url: string;
  host: string;
  /** https か（http なら暗号化していないと分かる印を付ける） */
  secure: boolean;
}

/**
 * 画像の src が外の画像なら、その URL とホスト（`//` で始まるものは https とみなす）。
 * ユーザー名・パスワードの入ったもの・http(s) でないもの・読めないものは null（外の画像として読み込まない）
 */
export function remoteImageOf(src: string): RemoteImage | null {
  const raw = src.trim();
  if (!/^(https?:)?\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname || url.username || url.password) return null;
  return { url: url.href, host: url.host.toLowerCase(), secure: url.protocol === "https:" };
}

/** 画像の src が手元のファイルのパスか（スキームも `//` もない。data: などのスキーム付きは違う） */
export function isLocalImagePath(src: string): boolean {
  const raw = src.trim();
  if (!raw || raw.startsWith("//")) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(raw);
}

const IMAGE_SYNTAX = /!\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;

/**
 * Markdown の文に書かれた画像の src（書いた順。`![alt](src "title")` の形だけ。参照の形・コードの中も拾うことがある）。
 * 画面が「host から画像を n 件表示」の数と URL の一覧を作るのに使う（描くのは Markdown の部品）
 */
export function imageSourcesIn(markdown: string): string[] {
  if (!markdown.includes("![")) return [];
  return [...markdown.matchAll(IMAGE_SYNTAX)].map((m) => m[1]);
}
