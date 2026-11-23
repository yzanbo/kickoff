// MySQL / MariaDB の列の型の名前（mysql2 の型の番号と文字コードから、SQL の型の名前に）
import mysql, { type FieldPacket } from "mysql2";
import type { DbColumns } from "@/features/database/worker/driver";

/** mysql2 の型の名前のうち、SQL の型の名前と違うもの（DECIMAL は NEWDECIMAL、INT は LONG で届く） */
const SQL_TYPE_NAMES: Record<string, string> = {
  NEWDECIMAL: "decimal",
  TINY: "tinyint",
  SHORT: "smallint",
  INT24: "mediumint",
  LONG: "int",
  LONGLONG: "bigint",
  VAR_STRING: "varchar",
  STRING: "char",
  NEWDATE: "date",
  TINY_BLOB: "tinyblob",
  MEDIUM_BLOB: "mediumblob",
  LONG_BLOB: "longblob",
};

/** TEXT の列も BLOB の型の番号で届く（文字コードが binary でないものが TEXT） */
const TEXT_OF_BLOB: Record<string, string> = { TINY_BLOB: "tinytext", BLOB: "text", MEDIUM_BLOB: "mediumtext", LONG_BLOB: "longtext" };
/** MySQL の文字コードの番号のうち、バイナリ（BLOB・BINARY）を表すもの */
const BINARY_CHARSET = 63;

/** 列の型の名前（mysql2 の型の番号から、SQL の型の名前で。DECIMAL → decimal、文字コードのある BLOB → text） */
export function mysqlTypeName(f: Pick<FieldPacket, "columnType" | "type" | "characterSet">): string | null {
  const name = (mysql.Types as unknown as Record<number, string | undefined>)[f.columnType ?? f.type ?? -1];
  if (!name) return null;
  const text = TEXT_OF_BLOB[name];
  if (text && f.characterSet !== undefined && f.characterSet !== BINARY_CHARSET) return text;
  return SQL_TYPE_NAMES[name] ?? name.toLowerCase();
}

/** 結果の列（行を返さない文でも fields は来る。中身は undefined） */
export const mysqlColumns = (fields: FieldPacket[] | undefined): DbColumns => (fields ?? []).map((f) => ({ name: f.name, type: mysqlTypeName(f) }));
