// ツールの結果の画像（読む（Read）で読んだ画像）。コアが結果を記録するときは画像を捨てて「[image]」の文字だけを残すので、
// 画面は呼び出しの入力のパスから、いまのファイルを読んで出す（コアの GET /api/chats/:id/tool-image）

/** 画像として出すファイルの拡張子と Content-Type（Claude Code の読むが画像として読むもの） */
const TOOL_IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** パスが画像のファイルなら、その Content-Type（拡張子の大文字・小文字は問わない。画像でなければ null） */
export function toolImageType(path: string): string | null {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return TOOL_IMAGE_TYPES[name.slice(dot + 1).toLowerCase()] ?? null;
}

/** 画面に出す画像の大きさの上限（バイト） */
export const MAX_TOOL_IMAGE_BYTES = 30 * 1024 * 1024;

/** 応答のヘッダー: ファイルを最後に変えた時刻（ミリ秒。読んだあとに変わったかを画面が見分ける） */
export const TOOL_IMAGE_MTIME_HEADER = "x-file-mtime";
