// キー操作の判定（日本語入力の変換中・送る Enter・やめる Esc・修飾キー）。どの欄・どの部品でも同じ決まりにする（React に依存しない）

/** キーの知らせ（DOM の KeyboardEvent と React の KeyboardEvent のどちらでも。テストでは中身だけの物を渡せる） */
export interface KeyInput {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  keyCode?: number;
  /** DOM の KeyboardEvent の、変換中か */
  isComposing?: boolean;
  /** React の KeyboardEvent（変換中かは元の知らせにある） */
  nativeEvent?: { isComposing?: boolean };
}

/**
 * 日本語入力の変換中のキーか（変換を確定する Enter・変換をやめる Esc・候補を選ぶ ↑↓ は、アプリの操作に使わない）。
 * 変換を確定する Enter で isComposing を立てない環境もあるので、変換中の印の keyCode 229 も見る
 */
export function isComposing(e: KeyInput): boolean {
  return Boolean(e.isComposing || e.nativeEvent?.isComposing) || e.keyCode === 229;
}

/** 修飾キー（書いたものだけを押していること。省いたものは押していない） */
export interface Modifiers {
  meta?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

/** 押している修飾キーが、ちょうど mods か */
export function hasModifiers(e: KeyInput, { meta = false, ctrl = false, alt = false, shift = false }: Modifiers = {}): boolean {
  return e.metaKey === meta && e.ctrlKey === ctrl && e.altKey === alt && e.shiftKey === shift;
}

/** key（e.key。1 文字なら大文字・小文字を区別しない）を、ちょうど mods の修飾キーで押したか（変換中は除く） */
export function isKey(e: KeyInput, key: string, mods?: Modifiers): boolean {
  const same = key.length === 1 ? e.key.toLowerCase() === key.toLowerCase() : e.key === key;
  return same && hasModifiers(e, mods) && !isComposing(e);
}

/** 送る・決める Enter か（Shift+Enter は改行なので除く。⌘ / Ctrl を添えた Enter は含む。変換を確定する Enter は除く） */
export function isSubmitKey(e: KeyInput): boolean {
  return e.key === "Enter" && !e.shiftKey && !isComposing(e);
}

/**
 * 選んでいる行・カード・タブの名前を変え始める Enter か（修飾キーなし。変換を確定する Enter は除く）。
 * Finder と同じく、一覧の物にピントがあるときの Enter は名前の変更にし、開くのは押す・Space にする（利用者の依頼）
 */
export function isRenameKey(e: KeyInput): boolean {
  return isKey(e, "Enter");
}

/** 選んでいる行・カードを開く Space か（修飾キーなし） */
export function isOpenKey(e: KeyInput): boolean {
  return isKey(e, " ");
}

/** やめる Esc か（修飾キーなし。変換をやめる Esc は除く） */
export function isCancelKey(e: KeyInput): boolean {
  return isKey(e, "Escape");
}

/** このキーをここで使い切る（既定の動きにも、パネルを閉じる Esc などのほかの受け手にも渡さない） */
export function consumeKey(e: { preventDefault(): void; stopPropagation(): void }): void {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * 押している ⌘ の組み合わせ（⌘Enter・⌘⇧Enter で使われるボタンを、押している間だけ光らせる）。
 * ⌘ を押していない・Ctrl / Option も押しているときは null
 */
export type HeldMeta = "meta" | "meta-shift" | null;

export function heldMetaOf(e: KeyInput): HeldMeta {
  if (!e.metaKey || e.ctrlKey || e.altKey) return null;
  return e.shiftKey ? "meta-shift" : "meta";
}

/** Mac（iPhone・iPad も）か。ブラウザから開いたときは、開いた端末で決まる */
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

/**
 * アプリのショートカットの修飾キー（⌘K など）を押しているか: Mac は ⌘ だけ（Control は付けない）、ほかは Ctrl だけ。
 * Mac の Control は入力欄の編集のキー（⌃K 行末まで消す・⌃F / ⌃B / ⌃N カーソルを動かす・⌃T 入れ替えなど）なので、アプリで受けない
 */
export function hasAppModifier(e: KeyInput, mac = IS_MAC): boolean {
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}

/** 修飾キーだけを押したときの key（これだけでは、ピントの枠を出すキーボードの操作とみなさない） */
const MODIFIER_KEYS = new Set(["Shift", "Meta", "Control", "Alt", "CapsLock", "Fn", "FnLock", "OS", "Hyper", "Super", "AltGraph"]);

/**
 * ピントの枠（キーボードで操作しているときの枠）を出すキー操作か。修飾キーだけ・⌘ / ⌃ / ⌥ を押しながらのキー（ショートカット）は除く。
 * ブラウザの :focus-visible は Shift だけでもキーボードの操作とみなし、マウスで押したボタンに枠を出すため（app/inputModality.ts）
 */
export function isFocusRingKey(e: KeyInput): boolean {
  return !MODIFIER_KEYS.has(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey;
}
