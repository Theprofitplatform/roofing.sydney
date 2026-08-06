"use client";

/**
 * Hand a generated CSV to the browser.
 *
 * The BOM is not decoration: Xero and Excel both read UTF-8 correctly with it
 * and mangle the em dashes in our line descriptions without it, and a mangled
 * description is what the client sees on the invoice Xero then issues.
 */
export function downloadCsv(filename: string, csv: string): void {
  const BOM = "﻿";
  const blob = new Blob([BOM, csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking in the same tick races the download: Firefox and Safari read the
  // blob after the click returns, and an already-revoked URL saves an empty
  // file with no error anywhere. One turn of the event loop is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
