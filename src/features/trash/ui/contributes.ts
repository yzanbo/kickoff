// trash が拡張点に出すもの（app/renderer/registry.ts が入れる）: アプリの設定の節「ゴミ箱と整理」とプロジェクトのないものの欄・ゴミ箱の種類 file の行
import { settingsItems, settingsSections } from "@/features/settings/ui";
import { fileTrashKind } from "./fileKind";
import { trashKinds } from "./points";
import { trashSection, unassignedTrashItem } from "./settings/appSettings";

export const contributes = [settingsSections.item(trashSection), settingsItems.item(unassignedTrashItem), trashKinds.item(fileTrashKind)];
