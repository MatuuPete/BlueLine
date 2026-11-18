/** decodeURIComponent that returns null on malformed input (e.g. "%E0%A4%A") instead of throwing. */
export function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}
