// テストから取り決めどおりに API を呼ぶ口: 取り決めの呼び手（@shared/foundation/contract の createClient）に、fetch の代わりにテストのコアの call を渡す。
// 呼び出しの形は画面と同じ 呼び出し(キー, { params, query, body })。応答の状態コードも見るので、戻りは { status, body }。テストからだけ使う
import { createClient, type ClientArgs, type Contract, type RouteInput, type RouteKey, type RouteOutput } from "@shared/foundation/contract";

/** 応答（body は取り決めの応答の型。失敗の状態コードのときは失敗の本文） */
export interface TestReply<T> {
  status: number;
  body: T;
}

/** テストのコアの call（トークン付きで呼び、JSON の応答を返す） */
interface TestCaller {
  call(method: string, path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
}

/** テストの呼び手（取り決めにないキーは型で断る） */
export type TestClient<C extends Contract> = <K extends RouteKey<C>>(key: K, ...args: ClientArgs<RouteInput<C, K>, undefined>) => Promise<TestReply<RouteOutput<C, K>>>;

export function testClient<C extends Contract>(core: TestCaller, contract: C): TestClient<C> {
  return createClient<C>(contract, (req) => core.call(req.method, req.path, req.body)) as unknown as TestClient<C>;
}
