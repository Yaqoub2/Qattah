type Cell = string | number | null | undefined;

const escape = (v: Cell) => {
  const s = v == null ? "" : String(v);
  // Leading = + - @ would run as a formula in Excel.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV with a UTF-8 BOM so Excel shows Arabic correctly. */
export function toCsv(rows: Cell[][]): string {
  return "\uFEFF" + rows.map((r) => r.map(escape).join(",")).join("\r\n") + "\r\n";
}
