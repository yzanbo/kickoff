// DB クライアントの開いているタブ（置き場所ごとに保存する）。書き換えはいつも保存のいまの値から（描いたときの値を閉じ込めない。非同期のあとに古い並びで上書きしない）
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "@/features/database/ui/storage";
import type { DbClientTabs } from "@/features/database/ui/dbClientTabs";

export function useDbClientTabs(surfaceKey: string): { state: DbClientTabs; update(fn: (s: DbClientTabs) => DbClientTabs): void } {
  const key = storage.settings.tabs(surfaceKey);
  const [state] = useSetting(key);
  const update = (fn: (s: DbClientTabs) => DbClientTabs) => writeSetting(key, fn(readSetting(key)));
  return { state, update };
}
