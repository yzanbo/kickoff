// board がプロジェクトの画面の表（projectViews）に出す画面: ボード（真ん中だけ）
import { SquareKanban } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
import { BoardViewPage } from "./projectViewPages";

export const boardView: ProjectViewDef = { id: "board", label: "ボード", icon: SquareKanban, group: "work", order: 10, common: true, places: ["center"], Page: BoardViewPage };
