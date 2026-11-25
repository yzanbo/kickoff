import "./ProjectMark.css";
import { LayoutGrid, MessageCircle } from "lucide-react";
import { cx } from "@/foundation/ui/lib/cx";
import { COMMON_TONE, hueStyle, initialOf, useIsCommonProject, useProjectHue } from "./projectColor";

/**
 * プロジェクトの印（プロジェクトの色の角丸の四角に、名前の頭文字）。プロジェクトの色はこの印だけで出し、名前はどこでも普通の文字色にする
 * （サイドバーの見出し・画面の見出しの名前・バッジ・カンバンの段・切り替えのメニューで共通。横スライドの丸 `.workspace-dot` も同じ色）。
 * size: sm = 16px（バッジ・メニュー・段）/ md = 20px（見出し）。project がなければ全プロジェクトの印（灰色の四角に格子）、共通は灰色の四角に吹き出し
 */
export function ProjectMark({ project, size = "sm", className }: { project?: { id: number; name: string }; size?: "sm" | "md"; className?: string }) {
  const hue = useProjectHue(project?.id ?? 0);
  const common = useIsCommonProject(project?.id ?? 0);
  if (common) {
    return (
      <span className={cx("project-mark", size, COMMON_TONE, className)} aria-hidden>
        <MessageCircle size={size === "md" ? 12 : 10} />
      </span>
    );
  }
  if (!project) {
    return (
      <span className={cx("project-mark", size, "all-projects", className)} aria-hidden>
        <LayoutGrid size={size === "md" ? 12 : 10} />
      </span>
    );
  }
  return (
    <span className={cx("project-mark", size, className)} style={hueStyle(hue)} aria-hidden>
      {initialOf(project.name)}
    </span>
  );
}
