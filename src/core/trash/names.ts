// Kickoff のゴミ箱の純粋な決まり（元に戻すときの名前・置き場の ID の形）

/** 置き場の ID の形（uuid。AI の kickoff-trash は uuidgen を小文字にして付ける） */
export const isTrashId = (id: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

/**
 * 元の場所に同じ名前があるとき、重ならない名前を作る（「a.txt」→「a 2.txt」→「a 3.txt」。フォルダ・拡張子のない名前・「.env」のような名前は後ろに付ける）。
 * taken はその名前がもうあるか
 */
export function restoreName(name: string, taken: (candidate: string) => boolean): string {
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 2; ; n++) {
    const candidate = `${stem} ${n}${ext}`;
    if (!taken(candidate)) return candidate;
  }
}
