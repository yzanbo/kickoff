// browser がプロジェクトの画面の表（projectViews）に出す画面: 右サイドバーのブラウザ（右サイドバーだけ。ほかの中身を見ている間も隠して置く）
import { Globe } from "lucide-react";
import type { ProjectViewDef } from "@/features/projects/ui";
import { BrowserViewPage } from "./projectViewPages";

export const browserView: ProjectViewDef = { id: "browser", label: "ブラウザ", icon: Globe, group: "browser", order: 0, places: ["rightSidebar"], keepAlive: true, Page: BrowserViewPage };
