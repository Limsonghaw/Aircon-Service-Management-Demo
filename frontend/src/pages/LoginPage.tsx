import { translate as t, useLanguage } from '../i18n'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/useAuth'
import { LanguageSwitch } from '../components/LanguageSwitch'

export function LoginPage() {
  useLanguage()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await login(email, password)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '登录失败。')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-language"><LanguageSwitch /></div>
      <div className="login-brand">AC</div>
      <h1 id="login-title">{t("登录业务管理系统")}</h1>
      <p>Aircon Service Management (Demo)</p>
      {error && <p className="customer-error" role="alert">{t(error)}</p>}
      <form className="login-form" onSubmit={submit}>
        <label>{t("电邮")}<input required type="email" autoComplete="username" value={email}
          onChange={(event) => setEmail(event.target.value)} /></label>
        <label>{t("密码")}<input required type="password" minLength={6} autoComplete="current-password" value={password}
          onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="primary-button" disabled={submitting}>
          {t(submitting ? '登录中…' : '登录')}
        </button>
      </form>
    </section>
  </main>
}
