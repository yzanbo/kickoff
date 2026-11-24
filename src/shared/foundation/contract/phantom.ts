// 取り決め（HTTP・SSE）の型だけを運ぶ印と、2 つの型が同じかの確かめ

/** 型だけを運ぶ印（実体はない。IPC の取り決めと同じ考え方） */
export declare const types: unique symbol;

/** 2 つの型が両向きに同じか（取り決めの型と、受け口の zod・IPC の引数の形を比べる） */
export type Same<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;
