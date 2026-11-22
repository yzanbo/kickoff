import { useState, type DragEvent } from "react";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";

/**
 * いまドラッグしている物（ドラッグの間だけ。dragover ではデータを読めないので、始めたときに覚えて、落とす前に受けるかを決める）。
 * dragend と drop（落とした先の処理のあと）で消す
 */
let current: { type: string; value: unknown } | undefined;
if (typeof window !== "undefined") {
  const clear = () => (current = undefined);
  window.addEventListener("dragend", clear, true);
  window.addEventListener("drop", () => setTimeout(clear), true);
}

/** ドラッグする物の種類（dataTransfer の種類と、中身の書き方・読み方） */
export interface DragKind<T> {
  type: string;
  /** ドラッグを始める（データを入れ、いまドラッグしている物として覚える。絵は呼ぶ側が startDragGhost で出す） */
  start(e: DragEvent, value: T): void;
  /** いまドラッグしている物（この種類でなければ undefined） */
  current(): T | undefined;
  /** ドラッグ中の物がこの種類か */
  isIn(e: DragEvent): boolean;
  /** 落とした物（この種類でない・読めなければ undefined） */
  read(e: DragEvent): T | undefined;
}

/** ドラッグする物の種類を作る（write で dataTransfer に書き、read で読み戻す。読めなければ undefined） */
export function dragKind<T>(type: string, codec: { write(value: T): string; read(raw: string): T | undefined }): DragKind<T> {
  return {
    type,
    start(e, value) {
      current = { type, value };
      e.dataTransfer.setData(type, codec.write(value));
      e.dataTransfer.effectAllowed = "move";
    },
    current: () => (current?.type === type ? (current.value as T) : undefined),
    isIn: (e) => e.dataTransfer.types.includes(type),
    read: (e) => {
      const raw = e.dataTransfer.getData(type);
      return raw === "" ? undefined : codec.read(raw);
    },
  };
}

/** いまこの種類の物をドラッグしているか（ドラッグの間だけ出す落とし先に使う） */
export function useDragging(kind: DragKind<unknown>): boolean {
  const [dragging, setDragging] = useState(false);
  // 物がドラッグのデータを入れたあと（React の onDragStart のあと）に見るので、window の bubble で受ける
  useWindowEvent("dragstart", (e) => e.dataTransfer?.types.includes(kind.type) && setDragging(true));
  useWindowEvent("dragend", () => setDragging(false), dragging, true);
  useWindowEvent("drop", () => setDragging(false), dragging, true);
  return dragging;
}
