export const DEFAULT_THEME_COLOR = '#1677ff';
export const THEME_STORAGE_KEY = 'math-workbench.theme-color.v1';
export const THEME_PRESETS = [
  { label: '蓝色', color: DEFAULT_THEME_COLOR }, { label: '青绿', color: '#0f766e' },
  { label: '森林', color: '#389e0d' }, { label: '紫色', color: '#722ed1' },
  { label: '玫红', color: '#c41d7f' }, { label: '橙色', color: '#d46b08' },
  { label: '靛蓝', color: '#2f54eb' }, { label: '墨灰', color: '#595959' },
] as const;

export function normalizeThemeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  if (/^[0-9a-f]{3}$/.test(hex)) return `#${[...hex].map(char => char + char).join('')}`;
  return null;
}
function channels(color: string) {
  const hex = normalizeThemeColor(color) ?? DEFAULT_THEME_COLOR;
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
}
function luminance(color: string) {
  const linear = channels(color).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
export function contrastRatio(first: string, second: string) {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function solidTextColor(background: string) {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#000000') ? '#ffffff' : '#000000';
}
export function accentTextColor(color: string) {
  let rgb = channels(color);
  let result = normalizeThemeColor(color) ?? DEFAULT_THEME_COLOR;
  while (contrastRatio(result, '#ffffff') < 5) {
    rgb = rgb.map(channel => Math.floor(channel * 0.85));
    result = `#${rgb.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
  }
  return result;
}
export function accentBackground(color: string) {
  return `#${channels(color).map(channel => Math.round(channel * 0.08 + 255 * 0.92).toString(16).padStart(2, '0')).join('')}`;
}
