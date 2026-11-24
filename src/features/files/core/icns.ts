/** PNG の始まりの 8 バイト */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * icns（macOS のアイコン）の中で、いちばん大きい PNG を取り出す（なければ null）。
 * icns は「icns」と全体の長さのあとに、種類（4 文字）・長さ（見出しの 8 バイトを含む）・中身の項目が並ぶ。
 * いまの icns（iconutil で作るもの）は 32px 以上を PNG で持つので、ブラウザで出せる。古い形（ビットマップ・JPEG 2000）だけのものは出せない
 */
export function largestIcnsPng(data: Buffer): Buffer | null {
  if (data.length < 8 || data.toString("latin1", 0, 4) !== "icns") return null;
  const end = Math.min(data.length, data.readUInt32BE(4));
  let best: Buffer | null = null;
  for (let at = 8; at + 8 <= end; ) {
    const length = data.readUInt32BE(at + 4);
    if (length < 8 || at + length > end) break;
    const body = data.subarray(at + 8, at + length);
    if (body.subarray(0, 8).equals(PNG_SIGNATURE) && (!best || body.length > best.length)) best = body;
    at += length;
  }
  return best;
}
