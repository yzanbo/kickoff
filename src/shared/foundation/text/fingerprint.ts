// 文の指紋（長い文を覚えのキーにするとき、文そのものの代わりに使う短い文字列。同じ文なら同じ指紋）

/** 長さと FNV-1a（32 ビット）のハッシュ（"1234:k3x9a"）。違う文が同じ指紋になることはまれにあるので、取り違えても困らない覚え（描いた高さなど）にだけ使う */
export function textFingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}
