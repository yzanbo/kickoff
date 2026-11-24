// diagnostics がアプリの根に置く物
import type { AppHost } from "@/foundation/ui/shell/points";
import { CoreStatusBand } from "./CoreStatusBand";
import { DiagnosticsIndicator } from "./DiagnosticsIndicator";

export const diagnosticsHosts: AppHost[] = [
  // 性能の記録の様子（メニューの「ヘルプ」・設定の「診断」から始まる）
  { id: "diagnosticsIndicator", windows: "main", order: 100, Host: DiagnosticsIndicator },
  // Kickoff のコア（別のプロセス）が落ちた・応答しないときの帯（メインプロセスが知らせる）
  { id: "coreStatusBand", windows: "both", order: 110, Host: CoreStatusBand },
];
