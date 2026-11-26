import "./ProjectChip.css";
import type { ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";
import { COMMON_TONE, hueStyle, useProjectHue } from "./projectColor";
import { useIsCommonProject } from "./currentProject";
import { href } from "@/foundation/ui/navigation/router";
import { ProjectMark } from "./ProjectMark";

/**
 * プロジェクトのバッジ（プロジェクトの印 ProjectMark ＋ 名前 ＋ プロジェクトの色の薄い地。サイドバーの見出し・画面の見出しの名前と同じ出し方）。
 * linked: 押すとそのプロジェクトのカンバンを開く（チャットの見出しなど）。children: 名前の代わりに置くもの（選択欄など）。title: 乗せたときの説明（省けば「プロジェクト: 名前」）
 */
export function ProjectChip({
  id,
  name,
  linked,
  className,
  title,
  children,
}: {
  id: number;
  name: string;
  linked?: boolean;
  className?: string;
  title?: string;
  children?: ReactNode;
}) {
  const common = useIsCommonProject(id);
  const chip = (
    <span className={cx("project-chip", common && COMMON_TONE, className)} style={hueStyle(useProjectHue(id))} title={title ?? `プロジェクト: ${name}`}>
      <ProjectMark project={{ id, name }} />
      {children ?? name}
    </span>
  );
  if (!linked) return chip;
  return (
    <a className="project-chip-link" href={href({ name: "project", id, tab: "board" })}>
      {chip}
    </a>
  );
}
