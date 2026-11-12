import { app } from "electron";
import type { BrowserConsoleEntry } from "@shared/ipc";

// 埋め込みブラウザ（webview）のコンソールの出力を、作られたときから覚えておく（AI の browser_console・タブの「AI に渡す」。agentBrowser.ts）。
// 画面がタブを登録するのはページの準備ができてからなので、そこから聞き始めると読み込み中の出力を取りこぼすため。
// 読み直し・ページの移動の前の出力も残し、どのページで出たかを URL で覚える（「AI に渡す」で行ごとに書き添える）

/** 覚えておく件数（新しいものから） */
const CONSOLE_MAX = 200;

interface Logged {
  level: string;
  message: string;
  source: string | null;
  line: number;
  url: string;
  at: string;
}

const logs = new Map<number, Logged[]>();

/** webview が作られたら、コンソールの出力を覚え始める（ウィンドウを作る前に一度だけ呼ぶ） */
export function watchWebviewConsoles() {
  app.on("web-contents-created", (_e, contents) => {
    if (contents.getType() !== "webview") return;
    const id = contents.id;
    const list: Logged[] = [];
    logs.set(id, list);
    contents.on("console-message", ({ level, message, sourceId, lineNumber }) => {
      // 開発版の Electron がどのページにも出す安全の注意は、ページの出力ではないので覚えない
      if (message.startsWith("Electron Security Warning")) return;
      list.push({ level, message, source: sourceId || null, line: lineNumber, url: contents.getURL(), at: new Date().toISOString() });
      if (list.length > CONSOLE_MAX) list.splice(0, list.length - CONSOLE_MAX);
    });
    contents.once("destroyed", () => logs.delete(id));
  });
}

/** その webview のコンソールの出力（AI の browser_console の形の文。古い順。新しいものから CONSOLE_MAX 件） */
export const webviewConsoleOf = (id: number): string[] => (logs.get(id) ?? []).map((l) => `[${l.level}] ${l.message}${l.source ? ` (${l.source}:${l.line})` : ""}`);

const isProblem = (l: Logged): l is Logged & { level: BrowserConsoleEntry["level"] } => l.level === "error" || l.level === "warning";

/** その webview のコンソールの出力のうち、エラーと警告（古い順。出たページの URL 付き） */
export const webviewProblemsOf = (id: number): BrowserConsoleEntry[] => (logs.get(id) ?? []).filter(isProblem).map((l) => ({ ...l }));
