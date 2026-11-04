import { describe, expect, it } from "vitest";
import { containsJapanese } from "@/lib/japanese";

describe("containsJapanese", () => {
  it("is false for empty and Latin-script text", () => {
    expect(containsJapanese("")).toBe(false);
    expect(containsJapanese("Secret Santa")).toBe(false);
    expect(containsJapanese("Cześć ąćęłńóśźż")).toBe(false);
    expect(containsJapanese("Hallo schön Größe")).toBe(false);
    expect(containsJapanese("¡Hola niño!")).toBe(false);
  });

  it("is true for kana, kanji, and mixed strings", () => {
    expect(containsJapanese("こんにちは")).toBe(true);
    expect(containsJapanese("オフィス")).toBe(true);
    expect(containsJapanese("東京")).toBe(true);
    expect(containsJapanese("Adaさん")).toBe(true);
    expect(containsJapanese("Hi 太郎")).toBe(true);
  });

  it("does not keep match state between calls", () => {
    expect(containsJapanese("こんにちは")).toBe(true);
    expect(containsJapanese("hello")).toBe(false);
    expect(containsJapanese("こんにちは")).toBe(true);
  });
});
