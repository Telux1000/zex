/**
 * RFC 4180–style CSV field rules for Excel/Sheets compatibility.
 */
export function escapeCsvField(value: string): string {
  if (/[\r\n",]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function csvLine(fields: string[]): string {
  return fields.map(escapeCsvField).join(',');
}
