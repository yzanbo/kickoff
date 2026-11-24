import type { PaletteNamedSource } from "@/features/palette/ui";
import { useProjectItems } from "./paletteSource";

/** ⌘K のプロジェクト（押すとボード）。「〇〇 で新しいチャット」はプロジェクトの操作なので、何か入力したときだけ先に並べる */
export const projectPaletteSource: PaletteNamedSource = {
  id: "project",
  label: "プロジェクト",
  order: 10,
  byDefault: true,
  useItems: useProjectItems,
};
