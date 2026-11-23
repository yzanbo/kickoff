import { Network } from "lucide-react";
import { commands } from "@/foundation/ui/commands";
import { portsAvailable } from "./native";
import { openPortsPopover } from "./portsStore";

/** ⌘K の「ポートを使っているプロセス」（何か入力したときだけ。下の帯を隠していても開ける。Mac のアプリの中だけ） */
export const portsCommand = commands.item({ id: "ports.open", title: "ポートを使っているプロセス", group: "操作", icon: Network, keywords: "port", when: () => portsAvailable(), run: openPortsPopover });
