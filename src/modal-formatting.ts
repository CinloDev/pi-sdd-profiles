import { matchesKey, Key, visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";

export { visibleWidth, truncateToWidth };

export function padToVisibleWidth(text: string, width: number): string {
  const clipped = truncateToWidth(text, width);
  const currentLen = visibleWidth(clipped);
  return `${clipped}${" ".repeat(Math.max(0, width - currentLen))}`;
}

export function constrainLines(lines: string[], width: number): string[] {
  const safeWidth = Math.max(1, Math.floor(width || 1));
  return lines.map((line) => truncateToWidth(line, safeWidth));
}

// Deep dark violet #140a28 (from Cinlodev CUTE theme: toolSuccessBg)
const VIOLET_BG_CODE = "\x1b[48;2;20;10;40m";
const VIOLET_BG_RESET = "\x1b[49m";

export function applyDarkVioletBg(text: string): string {
  const preserved = text
    .replace(/\x1b\[0m/g, `\x1b[0m${VIOLET_BG_CODE}`)
    .replace(/\x1b\[49m/g, VIOLET_BG_CODE);
  return `${VIOLET_BG_CODE}${preserved}${VIOLET_BG_RESET}`;
}

export function frameModal(title: string, body: string[], width: number, theme?: any): string[] {
  const safeWidth = Math.max(1, Math.floor(width || 1));
  if (safeWidth < 30) return constrainLines([title, ...body], safeWidth);

  const innerWidth = safeWidth - 2;
  const contentWidth = Math.max(1, innerWidth - 2);

  const titleFormatted = theme?.fg ? theme.fg("accent", ` ${title} `) : ` ${title} `;
  const borderChar = (char: string) => (theme?.fg ? theme.fg("borderAccent", char) || theme.fg("border", char) : char);

  const visibleTitleLen = visibleWidth(titleFormatted);
  const rightDashesCount = Math.max(0, innerWidth - visibleTitleLen);
  const top = `${borderChar("╔")}${titleFormatted}${borderChar("═".repeat(rightDashesCount))}${borderChar("╗")}`;
  const bottom = `${borderChar("╚")}${borderChar("═".repeat(innerWidth))}${borderChar("╝")}`;

  const rows = body.map((line) => {
    const padded = padToVisibleWidth(line, contentWidth);
    const bgRow = applyDarkVioletBg(` ${padded} `);
    return `${borderChar("║")}${bgRow}${borderChar("║")}`;
  });

  return [top, ...rows, bottom];
}

export function normalizeModalKey(data: string): string {
  if (
    matchesKey(data, Key.enter) ||
    matchesKey(data, Key.return) ||
    data === "\r" ||
    data === "\n" ||
    data === "\u001bOM"
  ) {
    return "enter";
  }
  if (matchesKey(data, Key.escape) || data === "\u001b") {
    return "esc";
  }
  if (
    matchesKey(data, Key.up) ||
    data === "\u001b[A" ||
    data === "\u001bOA" ||
    data === "\u001b[1;1A" ||
    data === "\u001b[a"
  ) {
    return "up";
  }
  if (
    matchesKey(data, Key.down) ||
    data === "\u001b[B" ||
    data === "\u001bOB" ||
    data === "\u001b[1;1B" ||
    data === "\u001b[b"
  ) {
    return "down";
  }
  if (matchesKey(data, Key.right) || data === "\u001b[C" || data === "\u001bOC") {
    return "right";
  }
  if (matchesKey(data, Key.left) || data === "\u001b[D" || data === "\u001bOD") {
    return "left";
  }
  if (matchesKey(data, Key.home) || data === "\u001b[H" || data === "\u001bOH" || data === "\u001b[1~") {
    return "home";
  }
  if (matchesKey(data, Key.end) || data === "\u001b[F" || data === "\u001bOF" || data === "\u001b[4~") {
    return "end";
  }
  if (matchesKey(data, Key.pageUp) || data === "\u001b[5~") {
    return "pageup";
  }
  if (matchesKey(data, Key.pageDown) || data === "\u001b[6~") {
    return "pagedown";
  }
  if (
    matchesKey(data, Key.delete) ||
    data === "\u001b[3~" ||
    data === "\u001b[3;5~" ||
    data === "\u001b[3;2~"
  ) {
    return "delete";
  }
  if (matchesKey(data, Key.backspace) || data === "\u007f" || data === "\b") {
    return "backspace";
  }
  return data;
}
