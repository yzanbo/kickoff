// conversation が拡張点に出すもの（app/renderer/registry.ts が入れる）: ⌥⌘T チャットの見出しの行の表示・非表示・⌘K のチャット内の文言
import { commands } from "@/foundation/ui/commands";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { CHAT_HEADER_ROW_HIDDEN } from "@/foundation/ui/storage/storageKeys";
import { paletteSources } from "@/features/palette/ui";
import { messagePaletteSource } from "./search/paletteSources";

export const contributes = [
  paletteSources.item(messagePaletteSource),
  commands.item({
    id: "conversation.toggleHeaderRow",
    title: "チャットの見出しの行の表示・非表示",
    // ⌥ を押すと文字が変わるので、キーの位置で見る（Finder・Safari の「ツールバーを隠す」と同じキー）。エディタが先に受けても効く
    keys: "alt+mod+code:KeyT",
    evenIfHandled: true,
    run: () => writeSetting(CHAT_HEADER_ROW_HIDDEN, !readSetting(CHAT_HEADER_ROW_HIDDEN)),
  }),
];
