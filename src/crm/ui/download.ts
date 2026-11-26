/** Hands text to the browser as a file download. Nothing is uploaded. CSV gets a byte order mark so spreadsheets read UTF-8. */
export function downloadText(fileName: string, text: string, mime: string): void {
  const bom = mime.startsWith('text/csv') ? '﻿' : '';
  const url = URL.createObjectURL(new Blob([bom + text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
