// 性能の記録（diagnostics.ts）の集計。Electron に依らない純粋関数（テストする）

/** 画面の処理の量（Performance.getMetrics の値。時間は秒の累計） */
export type Metrics = Record<string, number>;

/** 記録した間の、1 秒あたりの処理の時間（ミリ秒）と回数 */
export function perSecond(before: Metrics, after: Metrics, seconds: number) {
  const ms = (key: string) => Math.round((((after[key] ?? 0) - (before[key] ?? 0)) * 1000) / seconds);
  const count = (key: string) => Math.round(((after[key] ?? 0) - (before[key] ?? 0)) / seconds);
  return {
    /** JavaScript の実行 */
    scriptMs: ms("ScriptDuration"),
    /** レイアウト（並べ直し） */
    layoutMs: ms("LayoutDuration"),
    /** スタイルの計算 */
    styleMs: ms("RecalcStyleDuration"),
    /** 画面の処理の合計（上のほか、描画など） */
    taskMs: ms("TaskDuration"),
    layoutCount: count("LayoutCount"),
  };
}

/** 記録を保存するフォルダの名前（2026-11-03 22:15:30 → 20261103-221530） */
export function diagnosticsFolderName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** 画面（Kickoff のウィンドウ）の中で測る値。Runtime.evaluate で評価する式（返り値は JSON の文字列） */
export const RENDERER_PROBE = `JSON.stringify({
  route: location.hash,
  domNodes: document.getElementsByTagName("*").length,
  timelines: [...document.querySelectorAll(".timeline-inner")].map((t) => t.children.length),
  chatPanels: document.querySelectorAll(".chat-panel").length,
  panelTabs: document.querySelectorAll(".panel-tab").length,
  // 隠れていても作り直さずに残している中身（タブ・ペイン）。多いほど、描き直し・メモリが重くなる
  tabPages: document.querySelectorAll(".panel-tab-page").length,
  composers: document.querySelectorAll(".composer textarea").length,
  webviews: document.querySelectorAll("webview").length,
  terminals: document.querySelectorAll(".xterm").length,
  editors: document.querySelectorAll(".monaco-editor").length,
  diagrams: document.querySelectorAll(".mermaid-diagram, svg[id^=mermaid]").length,
  styleSheets: document.styleSheets.length,
  styleElements: document.querySelectorAll("style").length,
  highlights: typeof CSS !== "undefined" && CSS.highlights ? CSS.highlights.size : 0,
  visible: document.visibilityState,
})`;
