import { useT } from '../i18n/useT.ts'
import { setThemePreference, useThemePreference } from '../styles/theme.ts'
import { SegmentedSwitch } from './SegmentedSwitch.tsx'

export function ThemeSwitch() {
  const t = useT()
  const preference = useThemePreference()
  return (
    <SegmentedSwitch
      label={t('theme.label')}
      options={[
        { value: 'system', label: t('theme.system') },
        { value: 'light', label: t('theme.light') },
        { value: 'dark', label: t('theme.dark') },
      ]}
      value={preference}
      onChange={setThemePreference}
    />
  )
}
