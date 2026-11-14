// macOS の Docker のエンジンの起こし方（context の名前から: OrbStack・Docker Desktop はアプリを開く、colima はコマンドをコピーしてもらう）
import { findOrb } from "../../docker/cli.js";
import { runCommand } from "../../system/exec.js";
import type { DockerEngineStarters } from "../types.js";

/** context の名前から起こし方を決める（分からなければ null） */
export const macosDockerStarterOf: DockerEngineStarters["starterOf"] = (context) => {
  if (context === "orbstack") return { kind: "open", app: "OrbStack", label: "OrbStack を開く" };
  if (context === "desktop-linux") return { kind: "open", app: "Docker", label: "Docker Desktop を開く" };
  if (context === "colima" || context?.startsWith("colima-")) return { kind: "copy", command: context === "colima" ? "colima start" : `colima start --profile ${context.slice(7)}` };
  return null;
};

/** アプリを開く口（openApp）から、macOS の Docker のエンジンの起こし方を作る */
export function macosDockerEngine(openApp: (name: string) => Promise<void>): DockerEngineStarters {
  return {
    starterOf: macosDockerStarterOf,
    start: async (starter) => {
      await openApp(starter.app);
      // OrbStack はアプリが開いたままエンジンだけ止まっていることがある（open -a では起きない）。orb start は起きるまで待つので待たずに流す
      const orb = starter.app === "OrbStack" ? findOrb() : null;
      if (orb) void runCommand(orb, ["start"], { timeout: 120_000 }).catch(() => {});
    },
  };
}
