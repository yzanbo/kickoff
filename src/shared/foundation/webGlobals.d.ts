// shared が使う大域の型のうち、ES2023 の lib にないもの（Node・ブラウザ・React Native のどれにもある部分だけ）。
// tsconfig.shared.json だけが読む（ほかの設定は DOM か @types/node が同じものを持つので、重ねて読まない）
declare global {
  interface URLSearchParams {
    get(name: string): string | null;
    getAll(name: string): string[];
    has(name: string): boolean;
    set(name: string, value: string): void;
    append(name: string, value: string): void;
    delete(name: string): void;
    forEach(fn: (value: string, key: string) => void): void;
    entries(): IterableIterator<[string, string]>;
    toString(): string;
  }
  var URLSearchParams: { prototype: URLSearchParams; new (init?: string | Record<string, string> | [string, string][]): URLSearchParams };
  interface URL {
    hash: string; host: string; hostname: string; href: string; readonly origin: string; password: string;
    pathname: string; port: string; protocol: string; search: string; readonly searchParams: URLSearchParams; username: string;
    toString(): string;
  }
  var URL: { prototype: URL; new (url: string, base?: string | URL): URL };
  interface TextEncoder { encode(input?: string): Uint8Array }
  var TextEncoder: { prototype: TextEncoder; new (): TextEncoder };
  interface TextDecoder { decode(input?: Uint8Array, options?: { stream?: boolean }): string }
  var TextDecoder: { prototype: TextDecoder; new (label?: string, options?: { fatal?: boolean }): TextDecoder };
  function setTimeout(fn: () => void, ms?: number): unknown;
  function clearTimeout(id: unknown): void;
}
export {};
