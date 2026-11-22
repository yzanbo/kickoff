// palette がアプリの根に置く物: ⌘K のコマンドパレット
import type { AppHost } from "@/foundation/ui/shell/points";
import { CommandPalette } from "./CommandPalette";

export const commandPaletteHost: AppHost = { id: "commandPalette", windows: "main", order: 240, dialog: { id: "commandPalette", Dialog: CommandPalette } };
