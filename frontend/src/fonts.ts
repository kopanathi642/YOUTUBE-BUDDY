// Same font files as the server's title renderer (backend/app/titles.py) so preview == export.
const SCRIPTS: [number, number, string][] = [
  [0x0900, 0x097f, "CU Devanagari"], [0x0980, 0x09ff, "CU Bengali"], [0x0a00, 0x0a7f, "CU Gurmukhi"], [0x0a80, 0x0aff, "CU Gujarati"],
  [0x0b00, 0x0b7f, "CU Oriya"], [0x0b80, 0x0bff, "CU Tamil"], [0x0c00, 0x0c7f, "CU Telugu"], [0x0c80, 0x0cff, "CU Kannada"],
  [0x0d00, 0x0d7f, "CU Malayalam"], [0x0600, 0x06ff, "CU Arabic"],
];
export function titleFont(text: string): string {
  // Noto script fonts have no Latin letters, so list Inter second: the browser then picks per letter (like the server).
  for (const ch of text) { const cp = ch.codePointAt(0)!; for (const [a, b, f] of SCRIPTS) if (cp >= a && cp <= b) return `"CU Inter", "${f}"`; }
  return `"CU Inter"`;
}
