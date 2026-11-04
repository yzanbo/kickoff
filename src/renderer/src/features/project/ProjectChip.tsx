import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { projectHueStyle } from "./projectColor";
import { href } from "@/app/router";
import { ProjectMark } from "./ProjectMark";

/**
 * プロジェクトのバッジ（プロジェクトの印 ProjectMark ＋ 名前 ＋ プロジェクトの色の薄い地。サイドバーの見出し・画面の見出しの名前と同じ出し方）。
 * linked: 押すとそのプロジェクトのカンバンを開く（チャットの見出しなど）。children: 名前の代わりに置くもの（選択欄など）
 */
export function ProjectChip({
  id,
  name,
  linked,
  className,
  children,
}: {
  id: number;
  name: string;
  linked?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const chip = (
    <span className={cx("project-chip", className)} style={projectHueStyle(id)} title={`プロジェクト: ${name}`}>
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
