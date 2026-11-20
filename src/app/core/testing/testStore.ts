// テストの店の束: 全部の機能の表を v1 で作った DB（既定はメモリ）。テストと決まったデータの道具からだけ使う
import { openDb } from "@/foundation/core/db/db";
import type { Notify } from "@/foundation/core/db/common";
import { Store } from "@/foundation/core/db/store";
import { chatTitlesOf } from "@/features/chat/core/db/chatTitles";
import { createDatabaseStores } from "@/features/database/core/index";
import { createGitHubStores } from "@/features/github/core/index";
import { createChatImageStore } from "@/features/remoteImages/core/db/chatImages";
import { createWorktreeStores } from "@/features/worktrees/core/index";
import { MIGRATIONS } from "@/app/core/migrations";

/** 機能が自分で作る店（DB クライアント・GitHub・ワークツリー・外の画像）を、同じ DB に開き直したもの（店は DB のほかに状態を持たない） */
function featureStores(store: Store, onChange: Notify) {
  const { db } = store;
  return { ...createDatabaseStores(db, onChange, store.secrets, chatTitlesOf(db)), ...createGitHubStores(db), ...createWorktreeStores(db), chatImages: createChatImageStore(db) };
}

/** テストが表を直に見る・データを入れる店（店の束と、機能が自分で作る店） */
export type TestStores = Store & ReturnType<typeof featureStores>;

/** 店の束に、機能が自分で作る店を足す */
export function withFeatureStores(store: Store, onChange: Notify = () => {}): TestStores {
  return Object.assign(store, featureStores(store, onChange));
}

/** file を省くとメモリの DB。ファイルを渡すと、開き直したときも同じ版で開く */
export function testStore(file = ":memory:", onChange?: Notify): TestStores {
  return withFeatureStores(new Store(openDb(file, MIGRATIONS), onChange), onChange);
}
