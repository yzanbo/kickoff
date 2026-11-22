// ports が拡張点に出すもの（app/renderer/registry.ts が入れる）: ⌘K の「ポートを使っているプロセス」
import { portsCommand } from "./commands";

export const contributes = [portsCommand];
