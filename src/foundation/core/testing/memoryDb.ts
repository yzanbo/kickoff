// メモリの DB（テストの中で ":memory:" と書かず、ここから作る）
import { DatabaseSync } from "node:sqlite";

/** メモリの DB のファイル名（createKernel の dbFile・openDb に渡す） */
export const MEMORY_DB = ":memory:";

/** 空のメモリの DB（表は作らない） */
export const memoryDb = () => new DatabaseSync(MEMORY_DB);
