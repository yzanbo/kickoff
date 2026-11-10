// AI が渡したキーの名前を、Electron の sendInputEvent の keyCode にする（Electron に依らないのでテストする）

/** Web の KeyboardEvent.key の名前 → Electron のキーの名前（同じものは書かない） */
const ALIASES: Record<string, string> = {
  arrowup: "Up",
  arrowdown: "Down",
  arrowleft: "Left",
  arrowright: "Right",
  return: "Enter",
  esc: "Escape",
  " ": "Space",
  del: "Delete",
};

/** よく使うキー（大文字・小文字を問わずに受ける） */
const NAMED = ["Enter", "Escape", "Tab", "Backspace", "Delete", "Space", "Up", "Down", "Left", "Right", "PageUp", "PageDown", "Home", "End"];

/** キーの名前（Enter・ArrowDown・a など）を keyCode にする。知らない名前はそのまま渡す */
export function browserKeyCode(key: string): string {
  const lower = key.toLowerCase();
  return ALIASES[lower] ?? NAMED.find((n) => n.toLowerCase() === lower) ?? key;
}
