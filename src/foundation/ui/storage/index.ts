// 画面の保存の口（機能の ui/storage.ts の宣言と、読み書きする部品が読む）。
// 起動の片付けは prepareStorage.ts（殻が直に読む）、React からは @/foundation/ui/hooks/useSetting
export { defineSettings, family, single } from "./groups";
export { namedViews, type StoredView } from "./namedViews";
export {
  choice,
  flag,
  json,
  list,
  number,
  optionalFlag,
  readSetting,
  record,
  storedIds,
  subscribeFamily,
  subscribeSetting,
  text,
  writeSetting,
  type Setting,
  type SettingFamily,
  type SettingValue,
} from "./settings";
