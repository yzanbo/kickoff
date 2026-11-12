/** 切り詰めた結果（text は切ったあとの文。originalSize は切る前の UTF-8 のバイト数） */
export interface Truncated {
  text: string;
  truncated: boolean;
  originalSize: number;
}

/** 頭と終わりの間に入れる印（どれだけ省いたかを AI と利用者に伝える） */
function cutMark(omitted: number): string {
  return `\n\n…（ここで ${formatSize(omitted)} を省きました）…\n\n`;
}

/** バイト数を読みやすく（1.2 MB など） */
export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** UTF-8 の続きのバイト（文字の途中）か */
const isContinuation = (byte: number | undefined) => byte !== undefined && (byte & 0xc0) === 0x80;

/**
 * 文を UTF-8 で maxBytes 以下にする（「AI に渡す」の中身が添付の上限を超えたとき）。頭と終わりを残し、間に省いた量の印を入れる。
 * tailShare は残す分のうち終わりに回す割合（ログは終わりに大事なことが出るので多めにする）。文字の途中では切らない
 */
export function truncateText(text: string, maxBytes: number, tailShare = 0.5): Truncated {
  const bytes = new TextEncoder().encode(text);
  const originalSize = bytes.byteLength;
  if (originalSize <= maxBytes) return { text, truncated: false, originalSize };
  // 印の長さは省く量の桁で少し変わるので、多めに見積もって引いておく
  const budget = Math.max(0, maxBytes - new TextEncoder().encode(cutMark(originalSize)).byteLength - 16);
  const tailBytes = Math.floor(budget * Math.min(1, Math.max(0, tailShare)));
  let headEnd = budget - tailBytes;
  while (headEnd > 0 && isContinuation(bytes[headEnd])) headEnd--;
  let tailStart = originalSize - tailBytes;
  while (tailStart < originalSize && isContinuation(bytes[tailStart])) tailStart++;
  const decoder = new TextDecoder();
  const head = decoder.decode(bytes.subarray(0, headEnd));
  const tail = decoder.decode(bytes.subarray(tailStart));
  return { text: `${head}${cutMark(tailStart - headEnd)}${tail}`, truncated: true, originalSize };
}
