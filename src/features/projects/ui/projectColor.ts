import type { CSSProperties } from "react";
import type { Project } from "@shared/types";

// プロジェクトごとの色（色相）。プロジェクトの一覧を読み込むたびに入れる（DB に覚えた色。作ったときにほかと被らない色を選んでいる）
const hues = new Map<number, number>();

/** プロジェクトの一覧から、覚えている色を入れ直す（App がプロジェクトを読み込むたびに呼ぶ） */
export function setProjectHues(projects: Pick<Project, "id" | "hue">[]) {
  for (const p of projects) hues.set(p.id, p.hue);
}

/** プロジェクトの色相（サイドバーの見出し・切り替えアイコン・全プロジェクトのカンバンで同じ色を使う。まだ分からなければ ID から仮に決める） */
export function projectHue(id: number): number {
  return hues.get(id) ?? (id * 67) % 360;
}

/** プロジェクトの色を要素に渡す style（CSS の --ws-hue。印・札の地・横スライドの丸で使う） */
export function projectHueStyle(id: number): CSSProperties {
  return { "--ws-hue": `${projectHue(id)}` } as CSSProperties;
}

/** プロジェクト名の頭文字（アイコン用） */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}
