import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { KICKOFF_BUNDLE_ID } from "./pinstageBadgesModel";

export interface BadgeFile {
  write(json: string): Promise<void>;
  remove(): Promise<void>;
}

export function createPinstageBadgeFile(appData: () => string): BadgeFile {
  const directory = () => path.join(appData(), "Pinstage", "BadgeSources");
  const filename = `${KICKOFF_BUNDLE_ID}.json`;
  return {
    async write(json) {
      const dir = directory();
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      const temporary = path.join(dir, `.${KICKOFF_BUNDLE_ID}.${randomUUID()}.tmp`);
      const file = await fs.open(temporary, "wx", 0o600);
      try {
        try {
          await file.chmod(0o600);
          await file.writeFile(json, "utf8");
        } finally {
          await file.close();
        }
        // 同じフォルダの中で置き換え、読んでいる側に書きかけを見せない。
        await fs.rename(temporary, path.join(dir, filename));
      } catch (e) {
        await fs.unlink(temporary).catch(() => undefined);
        throw e;
      }
    },
    async remove() {
      try {
        await fs.unlink(path.join(directory(), filename));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    },
  };
}
