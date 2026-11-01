/** プロジェクトの色相（サイドバーの見出し・切り替えアイコン・全プロジェクトのカンバンで同じ色を使う） */
export function projectHue(id: number): number {
  return (id * 67) % 360;
}

/** プロジェクト名の頭文字（アイコン用） */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "?";
}
