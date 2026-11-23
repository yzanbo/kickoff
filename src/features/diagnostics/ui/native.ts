// diagnostics が window.kickoff を読む所（Mac のアプリの中だけ: 性能の記録・ログの場所・コアのプロセスの様子）
import type { CoreStatus, DiagnosticsFolders, DiagnosticsOverview, DiagnosticsState } from "@shared/foundation/ipc";

/** Mac のアプリの中か（ブラウザで開いた画面では記録を取れない・コアの帯を出さない） */
export const inDesktopApp = () => Boolean(window.kickoff);

/** 性能の記録の口（Mac のアプリの外なら何もしない・null） */
export const diagnosticsNative = {
  start: () => void window.kickoff?.diagnostics.start(),
  folders: async (): Promise<DiagnosticsFolders | null> => (await window.kickoff?.diagnostics.folders()) ?? null,
  overview: async (): Promise<DiagnosticsOverview | null> => (await window.kickoff?.diagnostics.overview()) ?? null,
  openLogs: () => void window.kickoff?.diagnostics.openLogs(),
  openRoot: () => void window.kickoff?.diagnostics.openRoot(),
  /** 記録の様子の知らせを受ける（やめるときは返り値を呼ぶ） */
  onState: (fn: (state: DiagnosticsState) => void) => window.kickoff?.diagnostics.onState(fn),
};

/** コアのプロセスの口（Mac のアプリの外なら null） */
export const coreNative = () => {
  const core = window.kickoff?.core;
  if (!core) return null;
  return {
    restart: () => core.restart(),
    wait: () => core.wait(),
    state: (): Promise<CoreStatus> => core.state(),
    onState: (fn: (status: CoreStatus) => void) => core.onState(fn),
  };
};
