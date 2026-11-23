// DB クライアントの開いているタブ（置き場所ごとに保存する）。書き換えはいつも保存のいまの値から（描いたときの値を閉じ込めない。非同期のあとに古い並びで上書きしない）
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { dbClientTabs } from "@/foundation/ui/storage/storageKeys";
import type { DbClientTabs } from "./dbClientTabs";

export function useDbClientTabs(surfaceKey: string): { state: DbClientTabs; update(fn: (s: DbClientTabs) => DbClientTabs): void } {
  const [state] = useSetting(dbClientTabs(surfaceKey));
  const update = (fn: (s: DbClientTabs) => DbClientTabs) => writeSetting(dbClientTabs(surfaceKey), fn(readSetting(dbClientTabs(surfaceKey))));
  return { state, update };
}
