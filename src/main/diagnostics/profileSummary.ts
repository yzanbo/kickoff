// 性能の記録（diagnostics.ts）の集計。Electron に依らない純粋関数（テストする）

/** Chrome の CPU プロファイル（Profiler.stop の profile。.cpuprofile として保存すると、Chrome の開発者ツールで開ける） */
export interface CpuProfile {
  nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }[];
  samples: number[];
  /** 各サンプルの前のサンプルからの時間（マイクロ秒） */
  timeDeltas: number[];
}

/** 時間を使った関数（自分の中で使った時間。呼んだ先の時間は含まない） */
export interface ProfileHotspot {
  /** 関数の名前（無名なら (anonymous)、(program) は描画など JavaScript の外、(idle) は空き時間） */
  name: string;
  /** ファイル名と行（1 始まり。分からなければ空） */
  where: string;
  selfMs: number;
  /** 記録した時間のうちの割合（%。空き時間を除いた時間に対して） */
  percent: number;
}

/** 空き時間など、関数として数えないもの */
const NOT_WORK = new Set(["(idle)"]);

/** 自分の中で時間を使った関数の上位（同じ関数は 1 つにまとめる） */
export function topSelfTime(profile: CpuProfile, limit = 30): ProfileHotspot[] {
  const byId = new Map(profile.nodes.map((n) => [n.id, n.callFrame]));
  const totals = new Map<string, { name: string; where: string; us: number }>();
  let busy = 0;
  profile.samples.forEach((id, i) => {
    const frame = byId.get(id);
    if (!frame) return;
    const us = profile.timeDeltas[i] ?? 0;
    const name = frame.functionName || "(anonymous)";
    if (NOT_WORK.has(name)) return;
    busy += us;
    const file = frame.url ? frame.url.split("/").pop()!.split("?")[0] : "";
    const where = file ? `${file}:${frame.lineNumber + 1}` : "";
    const key = `${name}@${where}`;
    const entry = totals.get(key) ?? { name, where, us: 0 };
    entry.us += us;
    totals.set(key, entry);
  });
  return [...totals.values()]
    .sort((a, b) => b.us - a.us)
    .slice(0, limit)
    .map((e) => ({ name: e.name, where: e.where, selfMs: Math.round(e.us / 1000), percent: busy ? Math.round((e.us / busy) * 1000) / 10 : 0 }));
}

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
