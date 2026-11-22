import type { PaletteTextSource } from "@/features/palette/ui";
import { api } from "@/foundation/ui/api";
import { currentProjectsIndex } from "@/features/projects/ui";
import { messageItem } from "./paletteSource";

/** ⌘K のチャット内の文言（全文検索のパネルと同じ API。入力したときだけ探す） */
export const messagePaletteSource: PaletteTextSource = {
  id: "message",
  label: "チャット内の文言",
  order: 40,
  search: (q) => api.search(q, {}).then((hits) => hits.map((h) => messageItem(h, currentProjectsIndex().projectName))),
};
