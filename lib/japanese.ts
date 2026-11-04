/** Hiragana, katakana, or kanji — enough to know Japanese type is needed. */
const JAPANESE_CHAR =
  /\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/u;

export const JAPANESE_FONTS_CLASS = "fonts-jp";
export const JAPANESE_FONTS_LINK_ID = "japanese-fonts";

/** Klee One + Zen Maru Gothic. Load only when `containsJapanese` is true. */
export const JAPANESE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&family=Zen+Maru+Gothic:wght@400;500;700&display=swap";

export function containsJapanese(text: string): boolean {
  return text.search(JAPANESE_CHAR) !== -1;
}
