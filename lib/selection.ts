// Hands a list of invoice ids to the export modal without stuffing them into the URL.
let pending: string[] = [];

export function setExportSelection(ids: string[]) {
  pending = ids;
}

export function takeExportSelection() {
  return pending;
}
