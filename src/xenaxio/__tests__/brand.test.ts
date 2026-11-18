import { describe, expect, it } from 'vitest';
import { rebrandMessages, rebrandText } from '../brand';
import { getDictionary } from '../../i18n';

describe('Xenaxio in Bulwark Mobile strings', () => {
  it('names the product, plain in inflected languages', () => {
    expect(rebrandText('Welcome to Bulwark Mobile')).toBe('Welcome to Xenaxio');
    expect(rebrandText('Vraťte se do Bulwarku')).toBe('Vraťte se do Xenaxio');
    expect(rebrandText('looksLikeBulwarkConfig')).toBe('looksLikeBulwarkConfig');
    expect(rebrandMessages({ a: 'Bulwark Mail', b: { c: 'Bulwark' }, n: 3 })).toEqual({ a: 'Xenaxio', b: { c: 'Xenaxio' }, n: 3 });
  });

  it('no loaded English or German string says Bulwark', () => {
    for (const locale of ['en', 'de'] as const) {
      expect(JSON.stringify(getDictionary(locale))).not.toMatch(/\bBulwark/);
      expect(JSON.stringify(getDictionary(locale, true))).not.toMatch(/\bBulwark/);
    }
  });
});
