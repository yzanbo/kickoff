// コードの色付けの結果を、Worker から画面へ小さく渡すための詰め方（純粋）。
// 断片の文字は画面にもあるコードから切り出せるので送らず、行ごとに「断片の数・断片ごとの長さと色の番号と字形」を Uint32Array に詰め、
// 色は表（palette）にまとめる。ArrayBuffer は transfer で渡すので、構造化の写しがほぼかからない

/** 色付きの断片（fontStyle は 1: 斜体 / 2: 太字 / 4: 下線 / 8: 取り消し線 の足し算） */
export interface CodeToken {
  content: string;
  color?: string;
  fontStyle?: number;
}

/** 詰めた結果 */
export interface EncodedTokens {
  /** 色の表（断片の色の番号 - 1 が添え字。0 は色なし） */
  palette: string[];
  /** 行ごとに [断片の数, (長さ, 色の番号 << 4 | 字形) × 断片の数] */
  data: Uint32Array;
}

/**
 * 行ごとの断片を詰める。断片の文字をつないだものがコードの各行と同じでなければ（切り出して戻せないので）null
 * （呼ぶ側は詰めずにそのまま送る）
 */
export function encodeTokens(code: string, lines: readonly (readonly CodeToken[])[]): EncodedTokens | null {
  const source = code.split("\n");
  if (source.length !== lines.length) return null;
  const palette: string[] = [];
  const colorIndex = new Map<string, number>();
  const out: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let joined = "";
    out.push(line.length);
    for (const token of line) {
      joined += token.content;
      let color = 0;
      if (token.color !== undefined) {
        color = colorIndex.get(token.color) ?? 0;
        if (!color) {
          palette.push(token.color);
          color = palette.length;
          colorIndex.set(token.color, color);
        }
      }
      out.push(token.content.length, (color << 4) | ((token.fontStyle ?? 0) & 15));
    }
    if (joined !== source[i]) return null;
  }
  return { palette, data: Uint32Array.from(out) };
}

/** 詰めたものを、コードから断片の文字を切り出して戻す */
export function decodeTokens(code: string, { palette, data }: EncodedTokens): CodeToken[][] {
  const source = code.split("\n");
  const lines: CodeToken[][] = [];
  let p = 0;
  for (let i = 0; i < source.length && p < data.length; i++) {
    const count = data[p++];
    const line: CodeToken[] = [];
    let at = 0;
    for (let t = 0; t < count; t++) {
      const length = data[p++];
      const packed = data[p++];
      const color = packed >> 4;
      const fontStyle = packed & 15;
      const token: CodeToken = { content: source[i].slice(at, at + length) };
      if (color) token.color = palette[color - 1];
      if (fontStyle) token.fontStyle = fontStyle;
      line.push(token);
      at += length;
    }
    lines.push(line);
  }
  return lines;
}
