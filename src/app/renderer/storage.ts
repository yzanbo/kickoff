// 全部の機能の保存の群（起動の片付け prepareStorage に渡す。宣言していないキーを消すより前に、全部をそろえる）。
// 各機能の ui/storage.ts と土台の storage.ts が出す storage を、import.meta.glob の eager で集める（Vite と Vitest の両方で効く）
import type { StorageGroup } from "@/foundation/ui/storage/groups";
import { storage as legacyKeys } from "@/foundation/ui/storage/legacyKeys";

const modules = import.meta.glob<StorageGroup>(["../../features/*/ui/storage.ts", "../../foundation/ui/*/storage.ts"], { eager: true, import: "storage" });

// storageKeys.ts の仮の群（legacyKeys.ts）は、0018 の P4-2b で機能ごとの storage.ts に配るまで（knip が glob の先を読まないので直に読む）
export const STORAGE_GROUPS: readonly StorageGroup[] = [...Object.values(modules), legacyKeys];
