// ai が下の帯に出す項目: CLI が使えないときの札（左）・AI ごとの使用状況（右）
import type { FooterItem } from "@/foundation/ui/shell/points";
import { FooterToolNotices } from "./FooterToolNotices";
import { FooterUsage } from "./usage/FooterUsage";

export const toolNoticesFooterItem: FooterItem = { id: "toolNotices", side: "start", order: 40, Item: FooterToolNotices };
export const usageFooterItem: FooterItem = { id: "usage", side: "end", order: 10, Item: FooterUsage };
