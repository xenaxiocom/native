// xenaxio: the product name in Bulwark Mobile's own strings. Applied when a catalog loads
// (src/i18n/index.ts), so the vendored locale files stay as upstream has them and new
// upstream strings are covered by themselves. The same rule as the web client's
// lib/xenaxio/brand.ts.
type Dictionary = Record<string, unknown>;

export const PRODUCT_NAME = 'Xenaxio';

// "Bulwark Mobile", "Bulwark Mail", "Bulwark Webmail", "Bulwark", and its inflected forms in
// other languages ("do Bulwarku", "Bulwarkhoz"), which take the plain name.
const BRAND = /\bBulwark(?:(?: Mobile| Mail| Webmail)\b|[a-zÀ-ɏ]+\b|\b)/g;

export function rebrandText(text: string): string {
  return text.includes('Bulwark') ? text.replace(BRAND, PRODUCT_NAME) : text;
}

export function rebrandMessages(messages: Dictionary): Dictionary {
  const out: Dictionary = {};
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === 'string') out[key] = rebrandText(value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) out[key] = rebrandMessages(value as Dictionary);
    else out[key] = value;
  }
  return out;
}
