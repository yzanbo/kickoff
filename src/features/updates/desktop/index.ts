// 更新のメインの部品（src/app/desktop/index.ts が土台へ渡す）: IPC の updates・「Kickoff について」の窓の版
import { defineDesktopPart } from "@/foundation/desktop/parts";
import { buildInfo, setAboutPanel } from "./buildInfo";
import { updatesArgs } from "./ipcArgs";

export const updatesDesktop = defineDesktopPart({
  name: "updates",
  ipc: { updates: { build: async () => buildInfo() } },
  argSchemas: updatesArgs,
  connectCore() {
    setAboutPanel(buildInfo());
  },
});
