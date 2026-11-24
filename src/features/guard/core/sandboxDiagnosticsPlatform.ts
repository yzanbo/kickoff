// 拒否ログの読み取り専用の口。任意のコマンド・predicate・PID を AI から受け取らない
export interface DiagnosticProcess {
  pid: number;
  ppid: number;
  /** OS が返す起動時刻（ミリ秒。macOS の ps は秒単位） */
  startedAt: number;
}

export interface SandboxDenial {
  timestamp: number;
  pid: number;
  operation: string;
  /** 診断に必要な既知のサービス名だけを残し、パス・任意の文字列は返さない */
  resource: "com.apple.FSEvents" | "<非表示>";
}

export type SandboxLogFailure = "format_unsupported" | "output_limit" | "process_exit" | "spawn_failed";

export interface SandboxDiagnosticsPlatform {
  /** 保存されない拒否も、診断中だけ読む。close はプロセスの終了まで待つ */
  watch?(signal: AbortSignal, entry: (entry: SandboxDenial) => void, failed: (reason: SandboxLogFailure) => void): Promise<() => Promise<void>>;
  processes(signal: AbortSignal): Promise<DiagnosticProcess[]>;
  /** 生の OS ログや失敗時の標準エラーは、この口の外に出さない */
  denials(start: number, end: number, signal: AbortSignal): Promise<SandboxDenial[]>;
}
