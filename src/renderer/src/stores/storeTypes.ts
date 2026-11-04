// 店（stores/）の形: 部品が読む様子（StoreState）・作るときの指定・できること（KeyedStore / Store）
import type { BusEvent } from "@shared/types";

/** 店の値の様子（部品はこれを読む。中身が変わるたびに別のものになり、変わらなければ同じもの） */
export interface StoreState<T> {
  /** 届いた値（まだなら undefined。取り直している間・失敗したあとも、前に届いた値を残す） */
  readonly data: T | undefined;
  /** 最後の読み込みの失敗の文（読めたら消える） */
  readonly error: string | undefined;
  /** 読み込んでいる最中か（初めて・取り直しのどちらも） */
  readonly loading: boolean;
  /** 値が届いたか（失敗だけなら false。失敗の前に届いた値があれば true のまま） */
  readonly loaded: boolean;
}

/** まだ何もない様子（どの店・key でも同じもの） */
export const EMPTY_STATE: StoreState<never> = Object.freeze({ data: undefined, error: undefined, loading: false, loaded: false });

export interface KeyedStoreOptions<K, T> {
  /** 読み込む（省けば読み込まず、set で入れた値だけを持つ） */
  load?: (key: K) => Promise<T>;
  /** サーバーの知らせで値を直す（関係なければ data をそのまま返す）。届いている key ごとに呼ぶ */
  reduce?: (data: T, event: BusEvent, key: K) => T;
  /** この知らせが来たら取り直す（読み込み中なら終わってからもう一度。使っていなければ、次に使うときに） */
  reloadOn?: (event: BusEvent, key: K) => boolean;
  /** この知らせが来たら、その key の値を捨てる（消えたプロジェクトのものなど） */
  dropOn?: (event: BusEvent) => K | undefined;
  /** 値が古くなるまでの時間（ms）。過ぎてから使うと、前の値を出したまま裏で取り直す（0 なら使い始めるたびに）。省けば古くならない */
  maxAge?: number;
  /** ウィンドウに戻ったとき、使っている値が古ければ取り直す */
  refreshOnFocus?: boolean;
}

/** key（プロジェクトの ID など）ごとに値を持つ店 */
export interface KeyedStore<K, T> {
  /** 読み込むか（load を渡したか。読み込まない店は、使い始めても読み込み中にならない） */
  readonly loads: boolean;
  /** いまの様子（部品の外からも読める） */
  get(key: K): StoreState<T>;
  /** その key の様子が変わったら listener を呼ぶ。やめるときは返り値を呼ぶ */
  subscribe(key: K, listener: () => void): () => void;
  /** どれかの key の様子が変わったら listener を呼ぶ（いくつかの key を読む部品のため） */
  subscribeAll(listener: () => void): () => void;
  /** どれかの key の様子が変わるたびに増える数 */
  version(): number;
  /** 使い始める（まだない・古ければ読み込む）。使い終わったら返り値を呼ぶ（失敗の自動の取り直し・つながったとき・ウィンドウに戻ったときは、使っている値だけを取り直す） */
  retain(key: K): () => void;
  /** まだない・古ければ読み込む（失敗したばかりなら、自動の取り直しを待つ） */
  ensure(key: K): void;
  /** 取り直す（読み込み中なら、終わってからもう一度）。届いた値を返す（失敗なら例外。待たなくてもよい） */
  reload(key: K): Promise<T>;
  /** 値を入れる（操作の応答で届いた一覧など）。読み込み中の依頼の結果は捨てる */
  set(key: K, value: T): void;
  /** 届いている値を直す（まだなければ何もしない。読み込み中なら、届いた値にも当てる） */
  update(key: K, change: (data: T) => T): void;
  /** 古いことにする（使っていればすぐ取り直す。届くまでは前の値を出す） */
  invalidate(key: K): void;
  /** 値を捨てる */
  drop(key: K): void;
}

/** 読み込み方・知らせでの直し方・古くなるまでの時間（意味は上の KeyedStoreOptions と同じ。key がないだけ） */
export interface StoreOptions<T> {
  load?: () => Promise<T>;
  reduce?: (data: T, event: BusEvent) => T;
  reloadOn?: (event: BusEvent) => boolean;
  maxAge?: number;
  refreshOnFocus?: boolean;
}

/** 値を 1 つだけ持つ店（できることは KeyedStore と同じ） */
export interface Store<T> {
  readonly loads: boolean;
  get(): StoreState<T>;
  subscribe(listener: () => void): () => void;
  retain(): () => void;
  ensure(): void;
  reload(): Promise<T>;
  set(value: T): void;
  update(change: (data: T) => T): void;
  invalidate(): void;
}
