// テスト用の一時フォルダ。テストからだけ使う
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after } from "node:test";

/**
 * 一時フォルダを作り、終わったら消す（node:test の after。テストの中で作ればそのテストのあと、ファイルの上で作れば
 * そのファイルのテストがすべて終わったあと）。real: シンボリックリンクを解決したパスで返す
 * （macOS の一時フォルダは /var → /private/var。Git などが返すパスと比べるとき）
 */
export function tempDir({ real = false }: { real?: boolean } = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kickoff-test-"));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return real ? fs.realpathSync(dir) : dir;
}
