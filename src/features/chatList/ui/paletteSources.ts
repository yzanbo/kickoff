import type { PaletteNamedSource } from "@/features/palette/ui";
import { useChatItems } from "./paletteSource";

/**
 * ⌘K のチャット（すべてのプロジェクトのアーカイブしていないもの。押すとそのチャット）。行の左はサイドバーの行と同じ状態の印
 * （作業中は回るリング・作業中のまま未読なら緑の点）、名前の後ろにグループと作業場所の札
 */
export const chatPaletteSource: PaletteNamedSource = {
  id: "chat",
  label: "チャット",
  order: 20,
  byDefault: true,
  useItems: useChatItems,
};
