// 音声モードの読み上げの補助（純粋関数）: AI の返答（Markdown）から声に出す文だけを取り出し、読み上げる区切りに分ける

/** コード・表の代わりに読む文（同じものが続いたら 1 回だけ） */
export const CODE_NOTE = "（コードは画面に出しました）";
export const TABLE_NOTE = "（表は画面に出しました）";
const LINK_NOTE = "（リンク）";

/** 表の行（| で始まる）と、表の見出しの下の区切り行 */
const TABLE_ROW = /^\s*\|.*\|\s*$/;

/** 1 行の Markdown の飾りを外して、読む文にする（リンクは文字だけ、URL は「（リンク）」、強調・インラインコードの印は外す） */
function plainLine(line: string): string {
  return (
    line
      // 画像は読まない・リンクは文字だけ
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<https?:\/\/[^>]+>/g, LINK_NOTE)
      .replace(/https?:\/\/[^\s)）」』]+/g, LINK_NOTE)
      // HTML のタグ
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      // 行の頭の見出し・引用・箇条書き・番号の印
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s*>+\s?/, "")
      .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, "")
      .replace(/^\s*\d+[.)]\s+/, "")
      // 強調・打ち消し・インラインコードの印
      .replace(/`+([^`]*)`+/g, "$1")
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(\*|_)(?=\S)(.+?)(?<=\S)\1/g, "$2")
      .replace(/~~(.+?)~~/g, "$1")
      .trim()
  );
}

/**
 * 返答の Markdown から、声に出す文だけを取り出す（利用者の選んだ「答えの文章だけ」）。
 * コードブロックは「（コードは画面に出しました）」、表は「（表は画面に出しました）」に置き換え（続いたら 1 回だけ）、
 * 区切り線・空行は落とす。段落は改行でつなぐ
 */
export function speakableText(markdown: string): string {
  const out: string[] = [];
  const push = (line: string) => {
    if (!line || out.at(-1) === line) return;
    out.push(line);
  };
  let fence: string | null = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(raw)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      fence = marker;
      push(CODE_NOTE);
      continue;
    }
    if (TABLE_ROW.test(raw)) {
      push(TABLE_NOTE);
      continue;
    }
    // 区切り線
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) continue;
    push(plainLine(raw));
  }
  return out.join("\n");
}

/** 文の終わり（日本語と英語の句点・感嘆符・疑問符。閉じかっこ・引用符が続けば含める） */
const SENTENCE = /[^。！？!?.\n]*(?:[。！？!?]+|\.(?=\s|$)|\n|$)[」』）)"']*/g;

/**
 * 読み上げる文を、一度に頼む区切りに分ける（文の終わりで切り、短い文は max 文字までつなぐ。
 * 1 文が max を超えるときは読点・空白で切り、なければ max 文字で切る）。最初の区切りを短くして、読み始めを早くする
 */
export function splitSpeech(text: string, max = 200, firstMax = 60): string[] {
  const sentences = (text.match(SENTENCE) ?? []).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  const limit = () => (chunks.length === 0 ? firstMax : max);
  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };
  for (const sentence of sentences) {
    for (const piece of cutLong(sentence, max)) {
      if (current && current.length + piece.length + 1 > limit()) flush();
      current = current ? `${current}${joiner(current, piece)}${piece}` : piece;
    }
  }
  flush();
  return chunks;
}

/** 長すぎる 1 文を、読点・空白の後ろで max 文字以内に切る */
function cutLong(sentence: string, max: number): string[] {
  const parts: string[] = [];
  let rest = sentence;
  while (rest.length > max) {
    const head = rest.slice(0, max);
    const at = Math.max(head.lastIndexOf("、"), head.lastIndexOf("，"), head.lastIndexOf(","), head.lastIndexOf(" "));
    const end = at > max / 3 ? at + 1 : max;
    parts.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** つなぐときの間（英字どうしだけ空白） */
const joiner = (a: string, b: string) => (/[A-Za-z0-9.,!?]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? " " : "");
