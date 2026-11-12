// AI に操作させる埋め込みブラウザの口（コアは Electron に依存しないので、操作の中身はメインプロセスが渡す。
// 単体のコア（npm run daemon）にはブラウザがないので、渡されなければ AI にブラウザのツールを出さない）

/** AI から見えるブラウザのタブ（id は埋め込みブラウザの WebContents の ID） */
export interface BrowserTabInfo {
  id: number;
  /** どのプロジェクトのパネルのタブか（全プロジェクトの画面の下のパネルなどは null） */
  project_id: number | null;
  url: string;
  title: string;
  loading: boolean;
}

/** ページの読み取り（押せる・入力できる要素には番号 ref を振り、ページの中に印を付けておく。押す・打つはその番号で指す） */
export interface PageSnapshot {
  url: string;
  title: string;
  /** 押せる・入力できる要素（ref・種類・名前・リンク先） */
  elements: { ref: number; tag: string; type: string | null; name: string; href: string | null }[];
  /** 見えている文（長ければ切る） */
  text: string;
  /** スクロールの位置（px）・ページの高さ・見えている高さ */
  scroll: { y: number; height: number; viewport: number };
}

/** 撮った画面（base64） */
export interface PageImage {
  data: string;
  mimeType: "image/png" | "image/jpeg";
}

export type HistoryAction = "back" | "forward" | "reload";

/**
 * タブを表に出す頼み（AI が作業の初めにタブを使うとき。利用者が AI の操作に気づけるように）。
 * after は、この作業で前に表に出したタブ。あれば、利用者がまだそのタブを見ているときだけ切り替える（ほかのタブに切り替えた・欄を閉じたなら出さない）
 */
export interface RevealRequest {
  after: number | null;
}

/** メインプロセスが実装する、埋め込みブラウザの操作。失敗は理由の文の Error で投げる */
export interface BrowserControl {
  /** いま開いているブラウザのタブ */
  tabs(): BrowserTabInfo[];
  /**
   * プロジェクトのチャット欄に新しいブラウザのタブを開き、読み込み終えたら返す。reveal があれば欄を開いて表に出し（キーボードのピントは動かさない）、
   * なければ表に出さずに足す。revealed は表に出したか
   */
  open(projectId: number, url: string, reveal: RevealRequest | null): Promise<{ tab: BrowserTabInfo; revealed: boolean }>;
  /** タブのある欄（チャット欄・下のパネル・ボードの右のパネル）を開き、そのタブを表示中にする（キーボードのピントは動かさない）。表に出したら true */
  reveal(tabId: number, request: RevealRequest): Promise<boolean>;
  navigate(tabId: number, url: string): Promise<BrowserTabInfo>;
  history(tabId: number, action: HistoryAction): Promise<BrowserTabInfo>;
  read(tabId: number): Promise<PageSnapshot>;
  screenshot(tabId: number): Promise<PageImage>;
  click(tabId: number, ref: number): Promise<string>;
  type(tabId: number, ref: number, text: string, submit: boolean): Promise<string>;
  press(tabId: number, key: string): Promise<string>;
  scroll(tabId: number, direction: "up" | "down" | "top" | "bottom"): Promise<string>;
  evaluate(tabId: number, script: string): Promise<string>;
  /** ページのコンソールの出力（新しいものから最大 200 件を古い順に） */
  consoleLogs(tabId: number): string[];
  /** AI がこのタブを操作した（画面のタブに「AI 操作中」の印を出す。しばらく操作がなければ消える） */
  touch(tabId: number): void;
}
