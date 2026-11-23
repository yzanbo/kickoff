// ports が下の帯に出す項目: プロジェクトのフォルダでポートを開いているプロセス（Mac のアプリの中だけ。帯を隠していても ⌘K から窓を開ける）
import type { FooterItem } from "@/foundation/ui/shell/points";
import { PortsButton, PortsFallback } from "./PortsButton";
import { portsAvailable } from "./native";

export const portsFooterItem: FooterItem = { id: "ports", side: "start", order: 60, Item: PortsButton, Fallback: PortsFallback, when: portsAvailable };
