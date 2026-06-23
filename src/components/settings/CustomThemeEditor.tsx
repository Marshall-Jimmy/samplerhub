import React, { useState } from 'react';
import { Button, Input, ColorPicker } from 'antd';
import { useTranslation } from 'react-i18next';
import { CustomTheme } from '../../stores/settingsStore';

export const CUSTOM_THEME_DEFAULTS: CustomTheme['colors'] = {
  bgBase: '#0A0A0B',
  bgSurface: '#111114',
  bgElevated: '#1A1A1F',
  bgHover: '#242429',
  bgActive: '#2C2C33',
  borderSubtle: '#222228',
  borderDefault: '#2C2C34',
  borderStrong: '#3A3A44',
  textPrimary: '#EEEEF0',
  textSecondary: '#9898A4',
  textTertiary: '#7A7A88',
  textDisabled: '#55555F',
  brandPrimary: '#6366F1',
  brandPrimaryHover: '#7577F5',
  brandAccent: '#22D3EE',
};

export const COLOR_FIELD_KEYS: { key: keyof CustomTheme['colors']; labelKey: string; groupKey: string }[] = [
  { key: 'bgBase', labelKey: 'settings.themePreviewBgBase', groupKey: 'settings.themeColorsBg' },
  { key: 'bgSurface', labelKey: 'settings.themePreviewBgSurface', groupKey: 'settings.themeColorsBg' },
  { key: 'bgElevated', labelKey: 'settings.themePreviewBgElevated', groupKey: 'settings.themeColorsBg' },
  { key: 'bgHover', labelKey: 'settings.themePreviewBgHover', groupKey: 'settings.themeColorsBg' },
  { key: 'bgActive', labelKey: 'settings.themePreviewBgActive', groupKey: 'settings.themeColorsBg' },
  { key: 'borderSubtle', labelKey: 'settings.themePreviewBorderSubtle', groupKey: 'settings.themeColorsBorder' },
  { key: 'borderDefault', labelKey: 'settings.themePreviewBorderDefault', groupKey: 'settings.themeColorsBorder' },
  { key: 'borderStrong', labelKey: 'settings.themePreviewBorderStrong', groupKey: 'settings.themeColorsBorder' },
  { key: 'textPrimary', labelKey: 'settings.themePreviewTextPrimary', groupKey: 'settings.themeColorsText' },
  { key: 'textSecondary', labelKey: 'settings.themePreviewTextSecondary', groupKey: 'settings.themeColorsText' },
  { key: 'textTertiary', labelKey: 'settings.themePreviewTextTertiary', groupKey: 'settings.themeColorsText' },
  { key: 'textDisabled', labelKey: 'settings.themePreviewTextDisabled', groupKey: 'settings.themeColorsText' },
  { key: 'brandPrimary', labelKey: 'settings.themePreviewBrandPrimary', groupKey: 'settings.themeColorsBrand' },
  { key: 'brandPrimaryHover', labelKey: 'settings.themePreviewBrandPrimaryHover', groupKey: 'settings.themeColorsBrand' },
  { key: 'brandAccent', labelKey: 'settings.themePreviewBrandAccent', groupKey: 'settings.themeColorsBrand' },
];

const CustomThemeEditor: React.FC<{
  onSave: (theme: CustomTheme) => void;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(t('settings.customThemeName'));
  const [colors, setColors] = useState<CustomTheme['colors']>({ ...CUSTOM_THEME_DEFAULTS });

  const updateColor = (key: keyof CustomTheme['colors'], value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
  };

  const groups = [...new Set(COLOR_FIELD_KEYS.map(f => f.groupKey))];

  return (
    <div style={{
      marginTop: 12,
      padding: 16,
      borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('settings.customThemeName')}
          size="small"
          style={{ width: 160, background: 'var(--bg-base)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button size="small" type="primary" onClick={() => onSave({ id: Date.now().toString(), name, colors })}>{t('common.save')}</Button>
        </div>
      </div>

      {/* 预览 */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12,
        padding: 10,
        borderRadius: 'var(--radius-md)',
        background: colors.bgBase,
        border: `1px solid ${colors.borderDefault}`,
      }}>
        <span style={{ display: 'flex', gap: 3 }}>
          <span style={{ width: 24, height: 24, borderRadius: 4, background: colors.bgBase, border: `1px solid ${colors.borderSubtle}` }} />
          <span style={{ width: 24, height: 24, borderRadius: 4, background: colors.bgSurface, border: `1px solid ${colors.borderSubtle}` }} />
          <span style={{ width: 24, height: 24, borderRadius: 4, background: colors.bgElevated, border: `1px solid ${colors.borderDefault}` }} />
          <span style={{ width: 24, height: 24, borderRadius: 4, background: colors.brandPrimary }} />
          <span style={{ width: 24, height: 24, borderRadius: 4, background: colors.brandAccent }} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: colors.textPrimary, fontWeight: 600 }}>Aa {t('settings.themePreviewTextPrimary')}</span>
          <span style={{ fontSize: 10, color: colors.textSecondary }}>Aa {t('settings.themePreviewTextSecondary')}</span>
          <span style={{ fontSize: 9, color: colors.textTertiary }}>Aa {t('settings.themePreviewTextTertiary')}</span>
        </div>
      </div>

      {/* 颜色编辑 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groups.map(group => (
          <div key={group}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t(group)}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COLOR_FIELD_KEYS.filter(f => f.groupKey === group).map(field => (
                <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ColorPicker
                    size="small"
                    value={colors[field.key]}
                    onChange={(_, hex) => updateColor(field.key, hex)}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', minWidth: 52 }}>{t(field.labelKey)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CustomThemeEditor;
