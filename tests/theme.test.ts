import { describe, expect, it } from 'vitest';
import { accentBackground, accentTextColor, contrastRatio, interactionPalette, normalizeThemeColor, solidTextColor, THEME_PRESETS } from '../src/theme-settings';

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
  it('preserves the selected fill and readable text and borders through every interaction state', () => {
    const grid = [0, 51, 102, 153, 204, 255];
    const colors = ['#d1f9c0', '#f1ffe9', '#fffbd1', ...THEME_PRESETS.map(preset => preset.color),
      ...grid.flatMap(r => grid.flatMap(g => grid.map(b => '#' + [r, g, b].map(value => value.toString(16).padStart(2, '0')).join(''))))];
    for (const color of colors) {
      const palette = interactionPalette(color);
      expect(palette.solid).toBe(color);
      for (const fill of [palette.solid, palette.solidHover, palette.solidActive]) expect(contrastRatio(palette.onSolid, fill), color).toBeGreaterThanOrEqual(4.5);
      for (const text of [palette.accent, palette.accentHover, palette.accentActive]) {
        for (const surface of ['#ffffff', '#f5f7fa', palette.background, palette.backgroundHover, palette.backgroundActive]) {
          expect(contrastRatio(text, surface), `${color}: ${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const border of [palette.solidBorder, palette.solidHoverBorder, palette.solidActiveBorder]) expect(contrastRatio(border, '#ffffff'), color).toBeGreaterThanOrEqual(3);
    }
  });
});
