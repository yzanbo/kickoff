// Map で代わりにする Web Storage（テストからだけ使う。Node には使える localStorage・sessionStorage がない）。テストの保存の後片付けは 2 つ:
// - installMemoryStorage の beforeEach が、自分の置いた Storage をテストごとに空にする（テストのファイルで clear() を重ねない）
// - vitest.setup.ts の beforeEach が、installMemoryStorage を通さずに vi.stubGlobal で置いた Storage を空にする（守り）
import { beforeEach, vi } from "vitest";

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  clear() {
    this.items.clear();
  }
}

/**
 * テストのファイルの上で呼ぶ: テストごとに空の localStorage・sessionStorage を globalThis に置き、それを返す。
 * 置くのは vi.stubGlobal なので、テストが終われば元に戻る（同じプロセスで続けて流すほかのファイルに残さない）
 */
export function installMemoryStorage(): { local: Storage; session: Storage } {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  beforeEach(() => {
    local.clear();
    session.clear();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
  });
  return { local, session };
}
