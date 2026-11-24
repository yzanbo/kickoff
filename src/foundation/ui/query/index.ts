// 取得の入口（1 つの部品だけが読む値を取る useQuery と、その一覧に続きを足す useCursorPages）
export { errorText } from "./queryState";
export { useCursorPages } from "./useCursorPages";
export { useQuery } from "./useQuery";
export type { QueryKey, QueryResult } from "./useQuery";
