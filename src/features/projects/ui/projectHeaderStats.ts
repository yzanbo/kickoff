// プロジェクトの画面の見出しの右に並べるもの（拡張点 projectHeaderStats）: 状態ごとのチャット数・すべてのプロジェクトの状態ごとのチャット。
// 持ち主の機能（chatList）が ui/contributes.ts で登録し、ProjectHeader が order の順に描く
import type { ComponentType } from "react";
import type { Project } from "@shared/projects/types";
import { definePoint } from "@/foundation/ui/points";

export interface ProjectHeaderStat {
  id: string;
  order: number;
  Component: ComponentType<{ project: Project }>;
}

export const projectHeaderStats = definePoint<ProjectHeaderStat>("projectHeaderStats", { key: (s) => s.id, order: (a, b) => a.order - b.order });
