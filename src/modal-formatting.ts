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

export interface FrameModalOptions {
  paddingX?: number;
  paddingY?: number;
}

export function frameModal(
  title: string,
  body: string[],
  width: number,
  theme?: any,
  options: FrameModalOptions = {}
): string[] {
  const safeWidth = Math.max(1, Math.floor(width || 1));
  if (safeWidth < 30) return constrainLines([title, ...body], safeWidth);

  const paddingX = options.paddingX ?? 2;
  const paddingY = options.paddingY ?? 1;

  const innerWidth = safeWidth - 2;
  const contentWidth = Math.max(1, innerWidth - (paddingX * 2));

  const safeFg = (color: string, text: string, fallback = "text"): string => {
    if (!theme?.fg) return text;
    try {
      return theme.fg(color, text);
    } catch {
      try {
        return theme.fg(fallback, text);
      } catch {
        return text;
      }
    }
  };

  const titleFormatted = safeFg("accent", ` ${title} `, "text");
  const borderChar = (char: string) => safeFg("borderAccent", char, "border");

  const visibleTitleLen = visibleWidth(titleFormatted);
  const rightDashesCount = Math.max(0, innerWidth - visibleTitleLen);
  const top = `${borderChar("╔")}${titleFormatted}${borderChar("═".repeat(rightDashesCount))}${borderChar("╗")}`;
  const bottom = `${borderChar("╚")}${borderChar("═".repeat(innerWidth))}${borderChar("╝")}`;

  const padLeft = " ".repeat(paddingX);
  const padRight = " ".repeat(paddingX);

  const renderRow = (content: string): string => {
    let rowContent = content;
    if (theme?.bg) {
      try {
        rowContent = theme.bg("customMessageBg", content);
      } catch {
        rowContent = content;
      }
    }
    return `${borderChar("║")}${rowContent}${borderChar("║")}`;
  };

  const emptyLine = renderRow(" ".repeat(innerWidth));

  const rows = body.map((line) => {
    const padded = padToVisibleWidth(line, contentWidth);
    return renderRow(`${padLeft}${padded}${padRight}`);
  });

  const verticalTop = Array(paddingY).fill(emptyLine);
  const verticalBottom = Array(paddingY).fill(emptyLine);

  return [top, ...verticalTop, ...rows, ...verticalBottom, bottom];
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
