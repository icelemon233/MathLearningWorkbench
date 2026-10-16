import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { App as AntdApp, Button, ColorPicker, ConfigProvider, Form, Input, Space, Tooltip, Typography } from 'antd';
import type { ColorPickerProps } from 'antd';
import { BgColorsOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import { Dialog } from './components';
import { accentBackground, accentTextColor, contrastRatio, DEFAULT_THEME_COLOR, normalizeThemeColor, solidTextColor, THEME_PRESETS, THEME_STORAGE_KEY } from './theme-settings';

const ThemeContext = createContext({ color: DEFAULT_THEME_COLOR, setColor: (_color: string) => {}, remembered: true });
function initialColor() {
  try { return normalizeThemeColor(localStorage.getItem(THEME_STORAGE_KEY)) ?? DEFAULT_THEME_COLOR; }
  catch { return DEFAULT_THEME_COLOR; }
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [color, updateColor] = useState(initialColor);
  const [remembered, setRemembered] = useState(true);
  const setColor = useCallback((value: string) => {
    const next = normalizeThemeColor(value);
    if (!next) return;
    updateColor(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); setRemembered(true); }
    catch { setRemembered(false); }
  }, []);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === THEME_STORAGE_KEY || event.key === null)) {
        updateColor(normalizeThemeColor(event.newValue) ?? DEFAULT_THEME_COLOR);
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const accent = accentTextColor(color);
  const controlColor = contrastRatio(color, '#ffffff') < 3 ? accent : color;
  const background = accentBackground(controlColor);
  useEffect(() => {
    // Modals and popups are portals outside AntdApp, so share colors at the root.
    document.documentElement.style.setProperty('--workbench-primary', controlColor);
    document.documentElement.style.setProperty('--workbench-accent', accent);
    document.documentElement.style.setProperty('--workbench-accent-bg', background);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', controlColor);
  }, [controlColor, accent, background]);
  const value = useMemo(() => ({ color, setColor, remembered }), [color, setColor, remembered]);
  return <ThemeContext.Provider value={value}>
    <ConfigProvider locale={zhCN} theme={{ token: {
      colorPrimary: controlColor, colorPrimaryText: accent, colorLink: accent, colorLinkHover: accent,
      colorBgLayout: '#f5f7fa', borderRadius: 8,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    }, components: {
      Layout: { headerBg: '#ffffff', siderBg: '#ffffff' },
      Menu: { itemBorderRadius: 6, itemSelectedColor: accent, itemSelectedBg: background },
      Button: { primaryColor: solidTextColor(controlColor) },
    } }}>
      <AntdApp style={{ '--workbench-primary': controlColor, '--workbench-accent': accent, '--workbench-accent-bg': background } as CSSProperties}>
        {children}
      </AntdApp>
    </ConfigProvider>
  </ThemeContext.Provider>;
}

type PickerColor = Parameters<NonNullable<ColorPickerProps['onChange']>>[0];
function ThemeSettings({ close }: { close: () => void }) {
  const { color, setColor, remembered } = useContext(ThemeContext);
  const [input, setInput] = useState(color);
  const [picker, setPicker] = useState<PickerColor | string>(color);
  const [error, setError] = useState('');
  useEffect(() => {
    setInput(color); setError('');
    setPicker(current => (typeof current === 'string' ? current : current.toHexString()) === color ? current : color);
  }, [color]);
  const apply = () => {
    const next = normalizeThemeColor(input);
    if (!next) { setError('请输入 3 位或 6 位十六进制颜色，例如 #0f766e。'); return; }
    setColor(next); setInput(next); setError('');
  };
  return <div className="page-stack">
    <Typography.Text type="secondary">选择预设颜色，或打开色盘自选。按钮、导航和强调色会立即更新。</Typography.Text>
    <div className="theme-presets">{THEME_PRESETS.map(preset => <Button key={preset.color}
      aria-label={`使用${preset.label}主题色`} aria-pressed={color === preset.color}
      className={color === preset.color ? 'theme-preset selected' : 'theme-preset'}
      onClick={() => { setColor(preset.color); setInput(preset.color); setError(''); }}>
      <span className="theme-swatch" style={{ background: preset.color }} aria-hidden />{preset.label}
      {color === preset.color && <CheckOutlined />}
    </Button>)}</div>
    <Form layout="vertical" onFinish={apply}>
      <Form.Item label="自选颜色" style={{ marginBottom: 16 }}>
        <ColorPicker value={picker} format="hex" disabledFormat disabledAlpha destroyOnHidden
          onChange={value => { setPicker(value); setColor(value.toHexString()); setInput(value.toHexString()); setError(''); }}>
          <Button icon={<span className="theme-swatch" style={{ background: color }} aria-hidden />}>打开色盘</Button>
        </ColorPicker>
      </Form.Item>
      <Form.Item label="颜色值" htmlFor="theme-color-value" validateStatus={error ? 'error' : undefined} help={error || '支持 HEX 颜色值；过浅的颜色会自动生成清晰的强调色。'} style={{ marginBottom: 0 }}>
        <Space.Compact className="full-width"><Input id="theme-color-value" aria-label="颜色值" value={input} maxLength={7}
          placeholder="#0f766e" onChange={event => { setInput(event.target.value); setError(''); }} />
          <Button type="primary" htmlType="submit">应用颜色</Button></Space.Compact>
      </Form.Item>
    </Form>
    <Typography.Text type="secondary">{remembered ? '颜色会在当前浏览器记住，下次打开继续使用。' : '颜色已应用，但当前浏览器无法保存偏好。'}</Typography.Text>
    <div className="form-footer">
      <Button icon={<ReloadOutlined />} onClick={() => { setColor(DEFAULT_THEME_COLOR); setInput(DEFAULT_THEME_COLOR); setError(''); }}>恢复默认</Button>
      <Button type="primary" onClick={close}>完成</Button>
    </div>
  </div>;
}
export function ThemeButton() {
  const [open, setOpen] = useState(false);
  return <>
    <Tooltip title="主题色设置"><Button type="text" icon={<BgColorsOutlined />} aria-label="主题色设置" onClick={() => setOpen(true)} /></Tooltip>
    {open && <Dialog title="主题色设置" close={() => setOpen(false)}><ThemeSettings close={() => setOpen(false)} /></Dialog>}
  </>;
}
