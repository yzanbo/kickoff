// devices が下の帯に出す項目: サーバーとの接続が切れたときの札
import type { FooterItem } from "@/foundation/ui/shell/points";
import { ConnectionFooterItem } from "./ConnectionFooterItem";

export const connectionFooterItem: FooterItem = { id: "connection", side: "start", order: 20, Item: ConnectionFooterItem };
