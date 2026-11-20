// テストの店の束: 全部の機能の表を v1 で作った DB（既定はメモリ）。テストからだけ使う
import { openDb } from "@/foundation/core/db/db";
import type { Notify } from "@/foundation/core/db/common";
import { Store } from "@/foundation/core/db/store";
import { MIGRATIONS } from "@/app/core/migrations";

/** file を省くとメモリの DB。ファイルを渡すと、開き直したときも同じ版で開く */
export function testStore(file = ":memory:", onChange?: Notify): Store {
  return new Store(openDb(file, MIGRATIONS), onChange);
}
