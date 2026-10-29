import { setLanguage, useLanguage } from '../i18n'
import './LanguageSwitch.css'

export function LanguageSwitch() {
  const language = useLanguage()
  return <div className="language-switch" role="group" aria-label="语言 / Language">
    <button type="button" lang="zh-Hans" aria-pressed={language === 'zh'} onClick={() => setLanguage('zh')}>中文</button>
    <button type="button" lang="en" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
  </div>
}
