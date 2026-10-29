const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function createLanguageSession({ saved = null, storageBlocked = false } = {}) {
  const preferences = new Map(saved ? [['shengheng.language', saved]] : [])
  const document = { documentElement: { lang: '' } }
  const events = new Map()
  const window = { addEventListener: (key, handler) => events.set(key, handler), removeEventListener: key => events.delete(key) }
  const localStorage = {
    getItem(key) { if (storageBlocked) throw Error('Storage blocked'); return preferences.get(key) ?? null },
    setItem(key, value) { if (storageBlocked) throw Error('Storage blocked'); preferences.set(key, value) },
  }
  let notify = () => {}, unsubscribe = () => {}
  function load(file) {
    const exports = {}
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(output, { exports, localStorage, document, window, require: name => name === 'react'
      ? { useSyncExternalStore: (subscribe, snapshot) => { unsubscribe = subscribe(() => notify()); return snapshot() } }
      : load('translations.ts') })
    return exports
  }
  return { ...load('i18n.ts'), document, preferences, events, onChange: handler => { notify = handler }, unsubscribe: () => unsubscribe() }
}

test('Chinese is the default and English is remembered for the next visit', () => {
  const session = createLanguageSession()
  assert.equal(session.translate('客户'), '客户')
  session.setLanguage('en')
  assert.equal(session.translate('客户'), 'Customers')
  assert.equal(session.preferences.get('shengheng.language'), 'en')
  assert.equal(session.document.documentElement.lang, 'en')
  const reopened = createLanguageSession({ saved: 'en' })
  assert.equal(reopened.translate('保存客户'), 'Save Customer')
  session.setLanguage('zh')
  assert.equal(session.translate('保存客户'), '保存客户')
  assert.equal(session.document.documentElement.lang, 'zh-Hans')
})

test('specific interpolation patterns take priority over generic job counts', () => {
  const { translate: t } = createLanguageSession({ saved: 'en' })
  assert.equal(t('今天有 12 项工作'), '12 jobs today')
  assert.equal(t('12 项工作'), '12 jobs')
  assert.equal(t('共 35 项 · 第 2 / 4 页'), '35 items · Page 2 / 4')
  assert.equal(t('已选择：中文客户 · 0123456789'), 'Selected: 中文客户 · 0123456789')
  assert.equal(t('确定要删除客户“中文客户”吗？'), 'Delete customer “中文客户”?')
})

test('unknown text, identifiers, numbers and record objects are retained', () => {
  const { translate: t } = createLanguageSession({ saved: 'en' })
  assert.equal(t('客户自行填写的备注'), '客户自行填写的备注')
  assert.equal(t('INV-2026-043'), 'INV-2026-043')
  assert.equal(t(42), 42)
  const record = { name: '客户', status: 'pending' }
  assert.equal(t(record), record)
  assert.equal(t('  保存客户  '), '  Save Customer  ')
})

test('switching works even when browser storage is unavailable', () => {
  const session = createLanguageSession({ storageBlocked: true })
  session.setLanguage('en')
  assert.equal(session.translate('工作单'), 'Jobs')
  session.setLanguage('zh')
  assert.equal(session.translate('工作单'), '工作单')
})

test('other tabs update subscribers and document language without remounting', () => {
  const session = createLanguageSession()
  let changes = 0
  session.onChange(() => changes++)
  assert.equal(session.useLanguage(), 'zh')
  session.preferences.set('shengheng.language', 'en')
  session.events.get('storage')({ key: 'shengheng.language' })
  assert.equal(changes, 1)
  assert.equal(session.translate('报价'), 'Quotations')
  assert.equal(session.document.documentElement.lang, 'en')
  session.events.get('storage')({ key: 'other-setting' })
  assert.equal(changes, 1)
  session.unsubscribe()
  assert.equal(session.events.has('storage'), false)
})
