import { describe, expect, it } from 'vitest';
import { accentBackground, accentTextColor, contrastRatio, normalizeThemeColor, solidTextColor, THEME_PRESETS } from '../src/theme-settings';

describe('custom theme color boundaries', () => {
  it('accepts HEX shorthand and normalizes a stored or typed color', () => {
    expect(normalizeThemeColor(' #AbC ')).toBe('#aabbcc');
    expect(normalizeThemeColor('0F766E')).toBe('#0f766e');
    for (const preset of THEME_PRESETS) expect(normalizeThemeColor(preset.color)).toBe(preset.color);
  });
  it('rejects corrupt storage, alpha, named colors, and CSS injection', () => {
    for (const input of [null, 1, {}, '', '#12345', '#ffffffff', 'red', 'url(https://example.test)', '#fff;background:red']) {
      expect(normalizeThemeColor(input)).toBeNull();
    }
  });
  it('keeps text readable for both extremes and across the RGB range', () => {
    for (const color of ['#000000', '#ffffff', '#ffff00', ...THEME_PRESETS.map(x => x.color), ...Array.from({ length: 64 }, (_, i) => '#' + ((i * 263171) % 16777216).toString(16).padStart(6, '0'))]) {
      expect(contrastRatio(color, solidTextColor(color))).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(accentTextColor(color), '#ffffff')).toBeGreaterThanOrEqual(5);
      expect(normalizeThemeColor(accentBackground(color))).toBeTruthy();
    }
  });
});
