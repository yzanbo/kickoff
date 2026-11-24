// 埋め込みブラウザを AI が操作するツール（kickoff_browser）の、画面とスマホに出す表示名と記録の行の文
import type { AiToolView } from "@shared/foundation/aiToolView";

const str = (value: unknown): string => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
/** 1 行目だけを max 文字までにする */
const clip = (text: string, max = 60): string => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
};
/** 押す・入れる要素の番号（「ref 3」） */
const refOf = (input: Record<string, unknown>) => (str(input.ref) ? `ref ${str(input.ref)}` : "");

const NAVIGATE_LABELS: Record<string, string> = { back: "戻る", forward: "進む", reload: "読み込み直す" };
const SCROLL_LABELS: Record<string, string> = { up: "上へ", down: "下へ", top: "いちばん上へ", bottom: "いちばん下へ" };

const view = (name: string, label: string, describe?: AiToolView["describe"]): AiToolView => ({ server: "kickoff_browser", name, label, describe });

/** ブラウザの機能のツールの表示の表 */
export const BROWSER_TOOL_VIEWS: readonly AiToolView[] = [
  view("browser_tabs", "ブラウザのタブを確かめる"),
  view("browser_open", "ページを開く", (input) => str(input.url)),
  view("browser_navigate", "ページを移動", (input) => NAVIGATE_LABELS[str(input.action)] ?? ""),
  view("browser_read", "ページを読む"),
  view("browser_screenshot", "ページを撮る"),
  view("browser_click", "ページをクリック", refOf),
  view("browser_type", "ページに入力", (input) => [refOf(input), clip(str(input.text), 40)].filter(Boolean).join(": ")),
  view("browser_press", "キーを押す", (input) => str(input.key)),
  view("browser_scroll", "ページをスクロール", (input) => SCROLL_LABELS[str(input.direction)] ?? ""),
  view("browser_eval", "ページで JavaScript を実行", (input) => clip(str(input.script))),
  view("browser_console", "コンソールを読む"),
];
