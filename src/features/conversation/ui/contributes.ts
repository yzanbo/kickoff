// conversation が拡張点に出すもの（app/renderer/registry.ts が入れる）: ⌥⌘T チャットの見出しの行の表示・非表示
import { commands } from "@/foundation/ui/commands";
import { IS_MAC } from "@/foundation/ui/lib/keys";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { CHAT_HEADER_ROW_HIDDEN } from "@/foundation/ui/storage/storageKeys";

export const contributes = [
  commands.item({
    id: "conversation.toggleHeaderRow",
    title: "チャットの見出しの行の表示・非表示",
    // ⌥ を押すと文字が変わるので、キーの位置で見る（Finder・Safari の「ツールバーを隠す」と同じキー。いまは Mac の ⌘ だけ）。エディタが先に受けても効く
    keys: "alt+mod+code:KeyT",
    evenIfHandled: true,
    when: () => IS_MAC,
    run: () => writeSetting(CHAT_HEADER_ROW_HIDDEN, !readSetting(CHAT_HEADER_ROW_HIDDEN)),
  }),
];
