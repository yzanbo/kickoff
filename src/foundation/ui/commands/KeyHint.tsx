import { commands, keyLabel, keysOf, type KeyCombo } from "./commands";

/** そのコマンドのキーの表示を、書いた順に全部（⌃1〜⌃9 のように、並びの n 番目を出すとき。なければ空） */
export function useCommandKeyList(id: string): readonly string[] {
  const command = commands.items().find((c) => c.id === id);
  return command ? keysOf(command).map((k) => keyLabel(k)) : [];
}

/** そのコマンドのキーの表示（title・aria-keyshortcuts に入れる文字。いちばん初めのキー、all なら全部を「 / 」でつなぐ。なければ null） */
export function useCommandKeys(id: string, { all = false }: { all?: boolean } = {}): string | null {
  const labels = useCommandKeyList(id);
  if (labels.length === 0) return null;
  return all ? labels.join(" / ") : labels[0];
}

/** キーの表示の小さな札（コマンドの id か、キーの書き方を渡す） */
export function KeyHint(props: { command: string } | { keys: KeyCombo }) {
  const fromCommand = useCommandKeys("command" in props ? props.command : "");
  const label = "keys" in props ? keyLabel(props.keys) : fromCommand;
  return label === null ? null : <kbd>{label}</kbd>;
}
