// ペアリングの QR に入れる文（端末がつなぐ先・使い捨ての番号・本体の ID）。スマホのアプリはこれを読み、iPhone のブラウザなら開ける形にする

/** QR に入れる URL（<つなぐ先>/pair?code=…&host=…）。つなぐ先がなければ null（QR を出さず番号だけ見せる） */
export function pairingLink(url: string | null, code: string, hostId: string): string | null {
  if (!url) return null;
  const base = url.replace(/\/+$/, "");
  return `${base}/pair?${new URLSearchParams({ code, host: hostId }).toString()}`;
}

/** 番号を読みやすく区切る（123456 → 123-456） */
export const formatPairingCode = (code: string): string => (code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code);
