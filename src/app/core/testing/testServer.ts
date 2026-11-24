// API のテスト（機能の core/routes.test.ts など）の共通の準備: 偽物で本物と同じ組み立てを通したアプリと、トークン付きで呼ぶ補助（testCore.ts の createTestCore）。テストからだけ使う。
// 一時フォルダは、そのテストが終わったら消える。Git の名前は、設定していない環境でもコミットできるよう testing/gitRepo.ts が環境変数で渡す
import "@/foundation/core/testing/gitRepo";
import { createTestCore } from "./testCore";

export { AUTH, TOKEN, until, watchTools } from "./testCore";

/** 偽のプロバイダーで API のアプリを組み立てる */
export function setup(opts?: Parameters<typeof createTestCore>[0]) {
  return createTestCore(opts);
}
