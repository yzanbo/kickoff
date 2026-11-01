import type { CSSProperties, ReactNode } from "react";
import { cx } from "../cx";
import { initialOf, projectHue } from "../projectColor";
import { href } from "../router";

/**
 * プロジェクトのバッジ（サイドバーと同じ色と頭文字で、どのプロジェクトかが一目でわかる）。
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
    <span className={cx("project-chip", className)} style={{ "--ws-hue": `${projectHue(id)}` } as CSSProperties} title={`プロジェクト: ${name}`}>
      <span className="project-chip-mark" aria-hidden>
        {initialOf(name)}
      </span>
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
