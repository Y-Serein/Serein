export function looksLikeMarkdownBlockPaste(text: string) {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized.includes("\n")) return false;

  const nonEmptyLines = normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (!nonEmptyLines.length) return false;

  return nonEmptyLines.some((line) => (
    /^ {0,3}#{1,6}\s+/.test(line)
    || /^ {0,3}(?:`{3,}|~{3,})/.test(line)
    || /^ {0,3}>\s?/.test(line)
    || /^\s{0,3}(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/.test(line)
    || /^ {0,3}\|.+\|/.test(line)
    || /^ {0,3}!\[[^\]\n]*]\([^)]+\)/.test(line)
  ));
}
