import type { CSSProperties } from "react";
import { initialOf, projectHue } from "../projectColor";

/** カードに付けるプロジェクトのバッジ（サイドバーと同じ色と頭文字で、どのプロジェクトかが一目でわかる） */
export function ProjectChip({ id, name }: { id: number; name: string }) {
  return (
    <span className="project-chip" style={{ "--ws-hue": `${projectHue(id)}` } as CSSProperties} title={`プロジェクト: ${name}`}>
      <span className="project-chip-mark" aria-hidden>
        {initialOf(name)}
      </span>
      {name}
    </span>
  );
}
