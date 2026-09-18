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

export interface ColumnWidths {
  col1: number;
  col2: number;
  col3: number;
}

export function computeThreeColumnWidths(contentWidth: number): ColumnWidths {
  // 2 vertical dividers of 1 char each
  const available = Math.max(15, contentWidth - 2);

  // Col 1 (Profiles) needs 18 chars ("  ○ deep-reasoning" is 18 chars)
  const col1 = Math.max(18, Math.min(22, Math.floor(available * 0.25)));
  // Col 3 (Effort) needs 18 chars ("Effort / Thinking" is 17 chars)
  const col3 = Math.max(18, Math.min(20, Math.floor(available * 0.23)));
  // Col 2 (Agents & Models) takes the remainder
  const col2 = Math.max(10, available - col1 - col3);

  return { col1, col2, col3 };
}

export function renderThreeColumns(
  col1Lines: string[],
  col2Lines: string[],
  col3Lines: string[],
  widths: ColumnWidths,
  divider: string = "│"
): string[] {
  const maxRows = Math.max(col1Lines.length, col2Lines.length, col3Lines.length);
  const rows: string[] = [];

  for (let i = 0; i < maxRows; i++) {
    const c1 = padToVisibleWidth(col1Lines[i] ?? "", widths.col1);
    const c2 = padToVisibleWidth(col2Lines[i] ?? "", widths.col2);
    const c3 = padToVisibleWidth(col3Lines[i] ?? "", widths.col3);
    rows.push(`${c1}${divider}${c2}${divider}${c3}`);
  }

  return rows;
}

export function renderTwoColumns(
  col1Lines: string[],
  col2Lines: string[],
  col1Width: number,
  col2Width: number,
  divider: string = "│"
): string[] {
  const maxRows = Math.max(col1Lines.length, col2Lines.length);
  const rows: string[] = [];

  for (let i = 0; i < maxRows; i++) {
    const c1 = padToVisibleWidth(col1Lines[i] ?? "", col1Width);
    const c2 = padToVisibleWidth(col2Lines[i] ?? "", col2Width);
    rows.push(`${c1}${divider}${c2}`);
  }

  return rows;
}

export function renderColumnHeaderDivider(
  widths: ColumnWidths,
  lineChar: string = "─",
  junctionChar: string = "┼"
): string {
  return `${lineChar.repeat(widths.col1)}${junctionChar}${lineChar.repeat(widths.col2)}${junctionChar}${lineChar.repeat(widths.col3)}`;
}

export interface FrameModalOptions {
  paddingX?: number;
  paddingY?: number;
  paddingTop?: number;
  paddingBottom?: number;
  showCloseButton?: boolean;
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
  const paddingTop = options.paddingTop ?? options.paddingY ?? 1;
  const paddingBottom = options.paddingBottom ?? options.paddingY ?? 1;
  const showClose = options.showCloseButton ?? true;

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

  const closeBtnText = "[ x ]";
  const closeBtnLen = showClose ? visibleWidth(closeBtnText) : 0;
  const closeBtnFormatted = showClose ? safeFg("error", closeBtnText, "text") : "";

  const maxTitleWidth = Math.max(10, innerWidth - (showClose ? closeBtnLen + 3 : 2));
  const clippedTitle = truncateToWidth(title, maxTitleWidth - 2);
  const titleFormatted = safeFg("accent", ` ${clippedTitle} `, "text");
  const borderChar = (char: string) => safeFg("borderAccent", char, "border");

  const visibleTitleLen = visibleWidth(titleFormatted);
  const dashesCount = Math.max(0, innerWidth - visibleTitleLen - (showClose ? closeBtnLen + 1 : 0));
  const top = showClose
    ? `${borderChar("╔")}${titleFormatted}${borderChar("═".repeat(dashesCount))} ${closeBtnFormatted}${borderChar("╗")}`
    : `${borderChar("╔")}${titleFormatted}${borderChar("═".repeat(dashesCount))}${borderChar("╗")}`;
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

  const verticalTop = Array(paddingTop).fill(emptyLine);
  const verticalBottom = Array(paddingBottom).fill(emptyLine);

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
  if (matchesKey(data, Key.space) || data === " ") {
    return "space";
  }
  if (matchesKey(data, Key.tab) || data === "\t") {
    return "tab";
  }
  if (data === "\u001b[Z") {
    return "backtab";
  }
  if (data === "\u0011") {
    return "ctrl+q";
  }
  return data;
}
