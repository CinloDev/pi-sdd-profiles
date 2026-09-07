export function stripTerminalEscapes(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "").replace(/\u001b\][^\u001b]*(?:\u001b\\|\u0007)/g, "");
}

export function visibleWidth(text: string): number {
  return stripTerminalEscapes(text).length;
}

export function truncateToVisibleWidth(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;
  if (width === 1) return "…";

  let output = "";
  let visible = 0;
  for (let index = 0; index < text.length; ) {
    if (text[index] === "\u001b") {
      const csi = text.slice(index).match(/^\u001b\[[0-9;]*m/);
      if (csi) {
        output += csi[0];
        index += csi[0].length;
        continue;
      }
      const osc = text.slice(index).match(/^\u001b\][^\u001b]*(?:\u001b\\|\u0007)/);
      if (osc) {
        output += osc[0];
        index += osc[0].length;
        continue;
      }
    }
    if (visible >= width - 1) break;
    output += text[index];
    visible += 1;
    index += 1;
  }
  return `${output}…`;
}

export function padToVisibleWidth(text: string, width: number): string {
  const clipped = truncateToVisibleWidth(text, width);
  return `${clipped}${" ".repeat(Math.max(0, width - visibleWidth(clipped)))}`;
}

export function constrainLines(lines: string[], width: number): string[] {
  const safeWidth = Math.max(1, Math.floor(width || 1));
  return lines.map((line) => truncateToVisibleWidth(line, safeWidth));
}

export function frameModal(title: string, body: string[], width: number, theme?: any): string[] {
  const safeWidth = Math.max(1, Math.floor(width || 1));
  if (safeWidth < 30) return constrainLines([title, ...body], safeWidth);

  const innerWidth = safeWidth - 2;
  const contentWidth = Math.max(1, innerWidth - 2);

  const titleFormatted = theme?.fg ? theme.fg("accent", ` ${title} `) : ` ${title} `;
  const borderChar = (char: string) => (theme?.fg ? theme.fg("border", char) : char);

  const visibleTitleLen = visibleWidth(titleFormatted);
  const rightDashesCount = Math.max(0, innerWidth - visibleTitleLen);
  const top = `${borderChar("╭")}${titleFormatted}${borderChar("─".repeat(rightDashesCount))}${borderChar("╮")}`;
  const bottom = `${borderChar("╰")}${borderChar("─".repeat(innerWidth))}${borderChar("╯")}`;

  const rows = body.map((line) => `${borderChar("│")} ${padToVisibleWidth(line, contentWidth)} ${borderChar("│")}`);

  return [top, ...rows, bottom];
}

export function normalizeModalKey(data: string): string {
  if (data === "\r" || data === "\n") return "enter";
  if (data === "\u001b") return "esc";
  if (data === "\u001b[A") return "up";
  if (data === "\u001b[B") return "down";
  if (data === "\u001b[C") return "right";
  if (data === "\u001b[D") return "left";
  if (data === "\u001b[H") return "home";
  if (data === "\u001b[F") return "end";
  if (data === "\u001b[5~") return "pageup";
  if (data === "\u001b[6~") return "pagedown";
  if (data === "\u007f" || data === "\b") return "backspace";
  return data;
}
