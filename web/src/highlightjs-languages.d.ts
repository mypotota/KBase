// highlight.js ships no per-language type declarations for its
// lib/languages/* subpaths; every grammar has the same shape.
declare module "highlight.js/lib/languages/*" {
  import type { LanguageFn } from "highlight.js";
  const language: LanguageFn;
  export default language;
}
