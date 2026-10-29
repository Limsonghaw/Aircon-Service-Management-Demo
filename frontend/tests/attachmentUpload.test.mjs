import test from 'node:test'
import assert from 'node:assert/strict'
import { uploadAttachment } from '../src/services/attachmentUpload.ts'
class FakeXHR {
  static latest
  upload = {}; timeout = 0; status = 0; responseText = ''
  constructor() { FakeXHR.latest = this }
  open(method, url) { this.method = method; this.url = url }
  send(body) { this.body = body }
}
const result = { id: 'safe-file', fileName: 'safe.png', contentType: 'image/png', fileSize: 12, createdAt: '2026-10-06T00:00:00Z', uploadedByName: 'test' }
const mocked = new WeakSet()
function setup(t) {
  if (!mocked.has(t)) {
    const original = globalThis.XMLHttpRequest
    t.after(() => { if (original === undefined) delete globalThis.XMLHttpRequest; else globalThis.XMLHttpRequest = original; mocked.delete(t) })
    mocked.add(t)
  }
  globalThis.XMLHttpRequest = FakeXHR
  const progress = []
  const promise = uploadAttachment('/api/safe/photos', new File(['safe'], 'safe.png'), p => progress.push(p), (message, uncertain, status) => Object.assign(new Error(message), { uncertain, status }))
  return { promise, progress, xhr: FakeXHR.latest }
}
test('progress uses transmitted bytes and waits for server confirmation at 100%', async t => {
  const { promise, progress, xhr } = setup(t)
  assert.equal(xhr.method, 'POST'); assert.equal(xhr.url, '/api/safe/photos')
  assert.equal(xhr.body.get('file').name, 'safe.png')
  assert.equal(xhr.timeout, 240000)
  xhr.upload.onprogress({ lengthComputable: true, loaded: 3, total: 12 })
  assert.deepEqual(progress.at(-1), { percent: 25, phase: 'sending' })
  xhr.upload.onload(); let settled = false
  promise.then(() => { settled = true })
  await Promise.resolve(); assert.equal(settled, false)
  assert.deepEqual(progress.at(-1), { percent: 100, phase: 'confirming' })
  xhr.status = 201; xhr.responseText = JSON.stringify(result); xhr.onload()
  assert.deepEqual(await promise, result)
})
test('unknown transfer length stays indeterminate', async t => {
  const { promise, progress, xhr } = setup(t)
  xhr.upload.onprogress({ lengthComputable: false, loaded: 1, total: 0 })
  assert.equal(progress.at(-1).percent, null)
  xhr.status = 200; xhr.responseText = JSON.stringify(result); xhr.onload(); await promise
})
for (const status of [400, 403, 500, 503]) test('HTTP ' + status + ' preserves its failure classification', async t => {
  const { promise, xhr } = setup(t)
  const rejected = assert.rejects(promise, error => error.status === status && error.uncertain === (status >= 500) && error.message === 'safe failure')
  xhr.status = status; xhr.responseText = JSON.stringify({detail:'safe failure'}); xhr.onload(); await rejected
})
for (const event of ['onerror', 'onabort', 'ontimeout']) test(event + ' requires checking the save result before retry', async t => {
  const { promise, xhr } = setup(t)
  const rejected = assert.rejects(promise, error => error.uncertain === true)
  xhr[event](); await rejected
})
test('invalid success and server HTML never become a success or expose HTML', async t => {
  let state = setup(t); let rejected = assert.rejects(state.promise, e => e.uncertain)
  state.xhr.status = 200; state.xhr.responseText = '{}'; state.xhr.onload(); await rejected
  state = setup(t); rejected = assert.rejects(state.promise, e => !e.message.includes('<html>') && e.uncertain)
  state.xhr.status = 500; state.xhr.responseText = '<html>database secrets</html>'; state.xhr.onload(); await rejected
})

test('non-text server details and upload limits keep useful safe explanations', async t => {
  let state = setup(t); let rejected = assert.rejects(state.promise, /上传失败，请稍后重试/)
  state.xhr.status = 400; state.xhr.responseText = JSON.stringify({ detail: { internal: 'safe mock' } }); state.xhr.onload(); await rejected
  state = setup(t); rejected = assert.rejects(state.promise, /10 MB/)
  state.xhr.status = 413; state.xhr.responseText = ''; state.xhr.onload(); await rejected
})
