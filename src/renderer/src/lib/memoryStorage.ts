/** Map で代わりにする Web Storage（テスト用。Node には localStorage・sessionStorage がない） */
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

/** テストの初めに呼ぶ: globalThis に空の localStorage・sessionStorage を置き、それを返す（テストごとに clear() で空にする） */
export function installMemoryStorage(): { local: Storage; session: Storage } {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  // 代入ではなく定義し直す（Web Storage を持つ Node では、読むだけのプロパティになっていることがある）
  for (const [name, value] of [["localStorage", local], ["sessionStorage", session]] as const) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  return { local, session };
}
