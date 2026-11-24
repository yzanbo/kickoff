// CommitInput の文字の決まり（純粋な関数。部品は CommitInput.tsx）

/** 欄の様子: text = 欄の文字・base = 書き始めたときの外の値・value = いまの外の値・focused = ピントがあるか */
export interface CommitTextState {
  text: string;
  base: string;
  value: string;
  focused: boolean;
}

/**
 * 外の値が変わったときに欄を合わせ直すか（合わせ直すなら新しい text と base、そのままなら null）。
 * ピントのある間は、ほかで設定が変わっても書きかけを書き換えない（ピントが外れたら合わせる）
 */
export function followValue({ base, value, focused }: CommitTextState): { text: string; base: string } | null {
  if (base === value || focused) return null;
  return { text: value, base: value };
}

/**
 * 保存する値（保存しないなら null）。書き始めてから文字を変えていなければ保存しない（外の値が変わっていても上書きしない）。
 * 前後の空白は除き、required なら空のときは保存しない
 */
export function commitValue({ text, base, value }: Omit<CommitTextState, "focused">, { required = false }: { required?: boolean } = {}): string | null {
  if (text === base) return null;
  const next = text.trim();
  if (next === value || (required && next === "")) return null;
  return next;
}
