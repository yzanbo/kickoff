// 名前を付けた見え方（ビュー）の一覧の保存の形（サイドバー・ボードの保存したビュー。一覧の操作は @/foundation/ui/lib/namedViews.ts）
import { json, type Shape } from "./settings";

/** 名前を付けた見え方（ビュー）1 つの保存の形（サイドバー・ボードの保存したビュー。state の中身は読む側で確かめる） */
export interface StoredView {
  id: string;
  name: string;
  state: Readonly<Record<string, unknown>>;
}

const isStoredView = (v: Partial<StoredView> | null): v is StoredView => !!v && typeof v.id === "string" && typeof v.name === "string" && typeof v.state === "object" && v.state !== null;

/** 名前を付けた見え方の一覧（id・name・state のそろわない要素は捨てる。すべて消しても [] で残し、初めの値に戻さない） */
export function namedViews(initial: readonly StoredView[]): Shape<readonly StoredView[]> {
  return json((value) => (Array.isArray(value) ? value.filter(isStoredView) : undefined), initial);
}
