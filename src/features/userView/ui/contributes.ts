// userView が拡張点に出すもの（app/renderer/registry.ts が入れる）: 見ているものを知らせる殻の副作用・タブの種類ごとの説明
import { appHosts } from "@/foundation/ui/shell/points";
import { userViewHosts } from "./appHosts";
import { userViewTabItems } from "./userViewTabs";

export const contributes = [...userViewHosts.map((h) => appHosts.item(h)), ...userViewTabItems];
