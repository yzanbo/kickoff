import { commands, keyLabel, keysOf, type KeyCombo } from "./commands";

/** そのコマンドのキーの表示（title・aria-keyshortcuts に入れる文字。いちばん初めのキー。なければ null） */
export function useCommandKeys(id: string): string | null {
  const command = commands.items().find((c) => c.id === id);
  const first = command ? keysOf(command)[0] : undefined;
  return first === undefined ? null : keyLabel(first);
}

/** キーの表示の小さな札（コマンドの id か、キーの書き方を渡す） */
export function KeyHint(props: { command: string } | { keys: KeyCombo }) {
  const fromCommand = useCommandKeys("command" in props ? props.command : "");
  const label = "keys" in props ? keyLabel(props.keys) : fromCommand;
  return label === null ? null : <kbd>{label}</kbd>;
}
