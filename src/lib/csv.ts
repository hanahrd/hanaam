/** CSV 수식 주입 방어: = + - @ 탭 캐리지리턴으로 시작하면 ' 접두 (SSOT 8절). */
export function csvEscape(value: unknown): string {
  let s = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** UTF-8 BOM 포함 CSV 문자열을 만든다. */
export function toCsv(rows: unknown[][]): string {
  return "\ufeff" + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}
