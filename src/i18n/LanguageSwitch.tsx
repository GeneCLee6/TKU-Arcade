import { SegmentedSwitch } from '../components/SegmentedSwitch.tsx'
import { setLanguage } from './t.ts'
import { useLanguage, useT } from './useT.ts'

export function LanguageSwitch() {
  const t = useT()
  const language = useLanguage()
  return (
    <SegmentedSwitch
      label={t('language.label')}
      options={[
        { value: 'en', label: t('language.en'), lang: 'en' },
        { value: 'zh-TW', label: t('language.zhTW'), lang: 'zh-TW' },
      ]}
      value={language}
      onChange={setLanguage}
    />
  )
}
