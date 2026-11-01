/** 入力された文字を URL にする（localhost:3000 → http://localhost:3000、ドメインなら https） */
export function normalizeUrl(input: string): string {
  const v = input.trim();
  if (!v) return "about:blank";
  if (/^(https?:\/\/|about:)/i.test(v)) return v;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/.*)?$/i.test(v)) return `http://${v}`;
  return `https://${v}`;
}
