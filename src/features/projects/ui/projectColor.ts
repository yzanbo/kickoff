import type { CSSProperties } from "react";
import { isCommonProject, type ProjectKind } from "@shared/projects/kinds";
import { currentProjects, useProjectsValue } from "./stores/projects";
import { useIsCommonProject } from "./currentProject";

/** プロジェクトの色相（DB に覚えた色。作ったときにほかと被らない色を選んでいる。一覧がまだ届いていなければ ID から仮に決める）。部品の外で読むとき */
export function projectHue(id: number): number {
  return currentProjects().find((p) => p.id === id)?.hue ?? (id * 67) % 360;
}

/** プロジェクトの色相を部品から（サイドバーの見出し・切り替えアイコン・全プロジェクトのカンバンで同じ色。色を変えたら描き直す） */
export function useProjectHue(id: number): number {
  return useProjectsValue(() => projectHue(id));
}

/**
 * 共通の色を灰色にするクラス（ProjectMark.css。--hue を使う色の彩度を 0 にする）。共通の印・丸・見出しのカード・札・段の見出しに付ける。
 * 共通は DB の色相を使わない（どのプロジェクトの色でもないと分かるように）
 */
export const COMMON_TONE = "project-common";

/** 色相を要素に渡す style（CSS の --hue。印・札の地・横スライドの丸で使う） */
export function hueStyle(hue: number): CSSProperties {
  return { "--hue": `${hue}` } as CSSProperties;
}

/** プロジェクトの色で塗る要素に付けるもの（共通は灰色のクラス COMMON_TONE を足す。className は共通でなければ undefined なので cx に渡す） */
export interface ProjectTone {
  className: string | undefined;
  style: CSSProperties;
}

const toneOf = (common: boolean, hue: number): ProjectTone => ({ className: common ? COMMON_TONE : undefined, style: hueStyle(hue) });

/** プロジェクトの色の className と style（札・横スライドの丸・見出しのカード・段の見出しで同じ出し方） */
export const projectTone = (project: { kind: ProjectKind | null; hue: number }): ProjectTone => toneOf(isCommonProject(project), project.hue);

/** projectTone を ID から部品で（一覧がまだ届いていなければ色は ID から仮に決める。色を変えたら描き直す） */
export function useProjectTone(id: number): ProjectTone {
  return toneOf(useIsCommonProject(id), useProjectHue(id));
}

/** プロジェクト名の頭文字（アイコン用） */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}
