/** クラス名をつなげる（false・空のものは除く） */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
