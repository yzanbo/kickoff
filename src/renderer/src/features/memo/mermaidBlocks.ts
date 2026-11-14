// メモの Markdown の中の ```mermaid（~~~mermaid）の塊を探す（メモのライブ表示で図にするため。純粋な関数）

/** Mermaid の塊。from は開きの行の頭、to は閉じの行の終わり（閉じていなければ探さない）、code は中身 */
export interface MermaidBlock {
  from: number;
  to: number;
  code: string;
}

/**
 * 塊を前から探す。開きは行の頭（空白 3 つまで）の ``` か ~~~ のあとに mermaid、閉じは同じ記号を同じ数以上の行。
 * 閉じていない塊（書いている途中）は図にしない
 */
export function mermaidBlocks(text: string): MermaidBlock[] {
  const out: MermaidBlock[] = [];
  const open = /^ {0,3}(`{3,}|~{3,})[ \t]*mermaid[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = open.exec(text))) {
    const fence = m[1];
    const bodyStart = m.index + m[0].length + 1;
    const close = new RegExp(`^ {0,3}${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`, "m");
    const rest = text.slice(bodyStart);
    const c = close.exec(rest);
    if (!c) break;
    const to = bodyStart + c.index + c[0].length;
    out.push({ from: m.index, to, code: rest.slice(0, Math.max(0, c.index - 1)) });
    open.lastIndex = to;
  }
  return out;
}
