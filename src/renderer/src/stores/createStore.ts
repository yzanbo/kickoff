// 画面全体で 1 つずつ持つデータ（サーバーから読むチャットの一覧・グループ・ワークツリー・音声入力の準備など）の入れ物。
// 読み込み（同時に頼まれても 1 回）・読み込み中・失敗・取り直し・サーバーの知らせでの更新・購読を、どのデータも同じ形で持つ。
// - 失敗は覚えない（前に届いた値は出したまま、使っていれば間隔を伸ばしながら自動で取り直す。サーバーにつながったときも）
// - 一度読んだ値は、使う部品がなくなっても知らせで直し続ける（次に開いたとき、取り直さずに正しい値を出せる）
// - 読み込みの最中に届いた知らせは、届いた値にもう一度当てる（読み込みと知らせが行き違っても取りこぼさない）
// - SSE がつながったら（初めて・つなぎ直し）、知らせで直している値を取り直す（つながる前・切れている間の知らせは届かないため）
// key ごとに値を持つ店は keyedStore.ts の createKeyedStore。React からは useStore.ts の hooks で読む
import { createKeyedStore } from "./keyedStore";
import type { Store, StoreOptions } from "./storeTypes";

const ONLY = 0;

/** 値を 1 つだけ持つ店を作る（設定・音声入力の準備・プロバイダーの状態など。key がないほかは createKeyedStore と同じ） */
export function createStore<T>({ load, reduce, reloadOn, maxAge, refreshOnFocus }: StoreOptions<T> = {}): Store<T> {
  const keyed = createKeyedStore<typeof ONLY, T>({
    load: load && (() => load()),
    reduce: reduce && ((data, event) => reduce(data, event)),
    reloadOn: reloadOn && ((event) => reloadOn(event)),
    maxAge,
    refreshOnFocus,
  });
  return {
    loads: keyed.loads,
    get: () => keyed.get(ONLY),
    subscribe: (listener) => keyed.subscribe(ONLY, listener),
    retain: () => keyed.retain(ONLY),
    ensure: () => keyed.ensure(ONLY),
    reload: () => keyed.reload(ONLY),
    set: (value) => keyed.set(ONLY, value),
    update: (change) => keyed.update(ONLY, change),
    invalidate: () => keyed.invalidate(ONLY),
  };
}
