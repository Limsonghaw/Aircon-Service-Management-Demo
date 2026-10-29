import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import ts from 'typescript'
import { OperationLock } from '../src/utils/operationLock.ts'

test('a second submission cannot acquire the lock before rendering or during a request', async () => {
  const lock = new OperationLock()
  let resolve
  const request = new Promise(done => { resolve = done })
  assert.equal(lock.acquire(), true)
  assert.equal(lock.acquire(), false)
  const pending = request.finally(() => lock.release())
  assert.equal(lock.acquire(), false)
  resolve()
  await pending
  assert.equal(lock.acquire(), true)
})

test('a failed operation releases its lock so an explicit retry can run', async () => {
  const lock = new OperationLock()
  assert.equal(lock.acquire(), true)
  await assert.rejects(Promise.reject(new Error('offline')).finally(() => lock.release()), /offline/)
  assert.equal(lock.acquire(), true)
})

// Compile the existing transport modules in memory; every fetch below is local and mocked.
const errorSource = await fs.readFile(new URL('../src/services/ApiValidationError.ts', import.meta.url), 'utf8')
const errorUrl = `data:text/javascript;base64,${Buffer.from(ts.transpile(errorSource, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })).toString('base64')}`
const uploadSource = await fs.readFile(new URL('../src/services/attachmentUpload.ts', import.meta.url), 'utf8')
const uploadUrl = `data:text/javascript;base64,${Buffer.from(ts.transpile(uploadSource, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })).toString('base64')}`
const changesSource = await fs.readFile(new URL('../src/services/jobChanges.ts', import.meta.url), 'utf8')
const changesUrl = `data:text/javascript;base64,${Buffer.from(ts.transpile(changesSource, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })).toString('base64')}`
for (const [service, save, args] of [
  ['customersApi', 'createCustomer', [{}]], ['invoicesApi', 'createInvoice', [{}]],
  ['expensesApi', 'saveExpense', [null, {}]], ['quotesApi', 'saveQuote', [null, {}]],
]) {
  const source = (await fs.readFile(new URL(`../src/services/${service}.ts`, import.meta.url), 'utf8')).replace("'./ApiValidationError'", JSON.stringify(errorUrl)).replace("'./attachmentUpload'", JSON.stringify(uploadUrl)).replace("'./jobChanges'", JSON.stringify(changesUrl))
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })).toString('base64')}`
  const api = await import(moduleUrl)
  const jobMutations = service === 'customersApi'
    ? [['createCustomerJob', ['test-customer', {}]], ['updateJob', ['test-job', {}]], ['deleteJob', ['test-job']]]
    : service === 'quotesApi' ? [['convertQuoteToJob', ['test-quote', {}]]] : []
  for (const [mutation, mutationArgs] of jobMutations) {
    test(`${mutation}: calendar invalidation waits for confirmed success and skips failures`, async context => {
      const target = new EventTarget()
      const previousWindow = globalThis.window
      globalThis.window = target
      let changes = 0
      target.addEventListener('jobs-changed', () => changes++)
      try {
        let finish
        context.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve }))
        const pending = api[mutation](...mutationArgs)
        assert.equal(changes, 0)
        finish(mutation === 'deleteJob' ? new Response(null, { status: 204 }) : new Response('{}', { status: 200 }))
        await pending
        assert.equal(changes, 1)
        const failing = api[mutation](...mutationArgs)
        finish(new Response('{"detail":"Safe simulated rejection"}', { status: 503 }))
        await assert.rejects(failing, /服务器暂时/)
        assert.equal(changes, 1)
      } finally {
        if (previousWindow === undefined) delete globalThis.window
        else globalThis.window = previousWindow
      }
    })
  }
  test(`${service}: validation failure preserves the specific reason and field messages`, async context => {
    context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ detail: 'Cannot save', errors: { Email: ['Invalid email'] } }), { status: 422 }))
    await assert.rejects(api[save](...args), error => error.message === 'Cannot save' && error.fields.Email[0] === 'Invalid email')
  })
  test(`${service}: successful response returns server data rather than submitted data`, async context => {
    context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ id: 'server-id', normalized: true }), { status: 200 }))
    assert.deepEqual(await api[save](...args), { id: 'server-id', normalized: true })
  })
  test(`${service}: non-JSON failure provides a useful fallback`, async context => {
    context.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }))
    await assert.rejects(api[save](...args), error => error.message.length > 0 && error.fields !== undefined)
  })
}

for (const [service, save] of [['jobPhotosApi', 'uploadJobPhoto'], ['expenseReceiptsApi', 'uploadExpenseReceipt']]) {
  const source = (await fs.readFile(new URL(`../src/services/${service}.ts`, import.meta.url), 'utf8')).replace("'./ApiValidationError'", JSON.stringify(errorUrl)).replace("'./attachmentUpload'", JSON.stringify(uploadUrl))
  const api = await import(`data:text/javascript;base64,${Buffer.from(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })).toString('base64')}`)
  const file = new File(['test'], 'check.png', { type: 'image/png' })
  test(`${service}: an explicit rejection is safe to retry`, async context => {
    context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ detail: 'File rejected' }), { status: 422 }))
    await assert.rejects(api[save]('test-id', file), error => error.message === 'File rejected' && error.uncertain === false)
  })
  test(`${service}: a lost connection requires checking the save result`, async context => {
    context.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Network unavailable') })
    await assert.rejects(api[save]('test-id', file), error => error.uncertain === true && error.message.includes('未确认'))
  })
  test(`${service}: malformed success cannot be presented as confirmed success`, async context => {
    context.mock.method(globalThis, 'fetch', async () => new Response('invalid JSON', { status: 200 }))
    await assert.rejects(api[save]('test-id', file), error => error.uncertain === true)
  })
}
