// Markdown のコードの囲み（純粋）

/** 中身に含まれるいちばん長い ` の並びより長い囲み（3 つ以上。ログに ``` があっても囲みが切れないように） */
export function fenceFor(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}
