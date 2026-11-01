/**
 * アドレス欄に入力された文字を、開く URL にする。
 * URL らしければそのまま開き（localhost:3000 → http、ドメインなら https）、それ以外は Google で検索する。
 */
export function normalizeUrl(input: string): string {
  const v = input.trim();
  if (!v) return "about:blank";
  if (/^(https?:\/\/|about:)/i.test(v)) return v;
  // 空白を含むものは検索語
  if (/\s/.test(v)) return googleSearch(v);
  // 手元の開発サーバー（localhost・IP アドレス・ホスト名:ポート）は http で開く
  if (/^(localhost|\[::1\]|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i.test(v)) return `http://${v}`;
  if (/^[a-z0-9-]+:\d+([/?#].*)?$/i.test(v)) return `http://${v}`;
  // ドメイン（example.com、foo.dev/path など）は https で開く
  if (/^([a-z0-9-]+\.)+[a-z][a-z0-9-]{1,62}(:\d+)?([/?#].*)?$/i.test(v)) return `https://${v}`;
  return googleSearch(v);
}

function googleSearch(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
