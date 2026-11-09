// ファイルタブで画像として見せるファイル（コアの GET /api/projects/:id/file/image が返し、画面の FileView がプレビューにする）

/** 拡張子 → コアが返す Content-Type（icns は中の PNG を取り出して返すので image/png） */
const IMAGE_FILE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  icns: "image/png",
};

/** 拡張子（小文字。名前の先頭の「.」だけのものは拡張子なし） */
function extensionOf(path: string): string | null {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
}

/** 画像として見せるファイルなら、コアが返す Content-Type（拡張子の大文字・小文字は問わない。画像でなければ null） */
export function imageFileType(path: string): string | null {
  const ext = extensionOf(path);
  return ext ? (IMAGE_FILE_TYPES[ext] ?? null) : null;
}

/** SVG か（文字のファイルなので、プレビューとコードを切り替えられる） */
export const isSvgFile = (path: string) => extensionOf(path) === "svg";

/** icns（macOS のアイコン。ブラウザでは出せないので、コアが中の PNG を取り出す） */
export const isIcnsFile = (path: string) => extensionOf(path) === "icns";

/** プレビューする画像の大きさの上限（バイト） */
export const MAX_IMAGE_FILE_BYTES = 30 * 1024 * 1024;
