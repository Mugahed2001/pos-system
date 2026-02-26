export function normalizeBarcode(input: string) {
  return input.replaceAll(" ", "").trim();
}
