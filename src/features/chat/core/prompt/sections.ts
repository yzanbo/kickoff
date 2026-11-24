// システムプロンプトの節（PromptSection）と、節を 1 つの文にする決まり。chat と上の機能（TurnContributor）が節を出し、実行が order の順につなぐ

/** システムプロンプトの 1 つの節 */
export interface PromptSection {
  /** 並び（chat 100・200・210、guard 220、browser 300、visuals 400、notes 500、chat 600）。同じ order は渡した順 */
  order: number;
  /** 見出し（"## ブラウザ" など）。null なら直前の節の続きの行（「作業の進め方」に足すゴミ箱・砂場の行） */
  heading: string | null;
  lines: string[];
}

/** 節を order の順（同じ order は渡した順）に 1 つの文にする: 見出しの前に空行 1 つ、見出しが null の節は直前の節の行に続ける */
export function joinSections(sections: readonly PromptSection[]): string {
  const lines: string[] = [];
  for (const { s } of sections.map((s, i) => ({ s, i })).sort((a, b) => a.s.order - b.s.order || a.i - b.i)) {
    if (s.heading !== null) lines.push(...(lines.length ? [""] : []), s.heading);
    lines.push(...s.lines);
  }
  return lines.join("\n");
}
