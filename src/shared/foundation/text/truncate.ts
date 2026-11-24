// 長い文を決めた文字数で切る（切ったら末尾に「…」）

/** text が max 文字より長ければ、max 文字で切って「…」を付ける（短ければそのまま） */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
