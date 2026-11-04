import { LayoutGrid } from "lucide-react";
import { cx } from "@/lib/cx";
import { initialOf, projectHueStyle } from "./projectColor";

/**
 * プロジェクトの印（プロジェクトの色の角丸の四角に、名前の頭文字）。プロジェクトの色はこの印だけで出し、名前はどこでも普通の文字色にする
 * （サイドバーの見出し・画面の見出しの名前・バッジ・カンバンの段・切り替えのメニューで共通。横スライドの丸 `.workspace-dot` も同じ色）。
 * size: sm = 16px（バッジ・メニュー・段）/ md = 20px（見出し）。project がなければ全プロジェクトの印（灰色の四角に格子）
 */
export function ProjectMark({ project, size = "sm", className }: { project?: { id: number; name: string }; size?: "sm" | "md"; className?: string }) {
  if (!project) {
    return (
      <span className={cx("project-mark", size, "all-projects", className)} aria-hidden>
        <LayoutGrid size={size === "md" ? 12 : 10} />
      </span>
    );
  }
  return (
    <span className={cx("project-mark", size, className)} style={projectHueStyle(project.id)} aria-hidden>
      {initialOf(project.name)}
    </span>
  );
}
