// Isolated QA only: no live APIs, accounts, database or storage.
const { chromium } = require('playwright');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist');
const out = path.resolve(__dirname, '../../output/reference-fix-qa');
const customerId = '51000000-0000-0000-0000-000000000001';
const documentId = '51000000-0000-0000-0000-000000000002';
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) { res.writeHead(503); res.end('QA only'); return; }
  const target = req.url.startsWith('/assets/') ? path.join(root, 'assets', path.basename(req.url)) : path.join(root, 'index.html');
  try { res.writeHead(200, { 'Content-Type': target.endsWith('.css') ? 'text/css' : /\.(js|mjs)$/.test(target) ? 'text/javascript' : 'text/html' }); res.end(await fs.readFile(target)); }
  catch { res.writeHead(404); res.end(); }
});
async function makePdf(table = false) {
  const pdf = await PDFDocument.create(), page = pdf.addPage([600, 800]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const text = (value, x, y) => page.drawText(value, { x, y, size: 10, font });
  if (table) {
    for (const [v, x] of [['No.', 20], ['Description', 50], ['Quantity', 300], ['Unit Price RM', 380], ['Amount RM', 470]]) text(v, x, 700);
    for (const [v, x] of [['1', 20], ['QA Cleaning', 50], ['4', 320], ['120.00', 400], ['480.00', 490]]) text(v, x, 675);
    for (const [v, x] of [['2', 20], ['QA Replacement', 50], ['1', 320], ['80.00', 400], ['80.00', 490]]) text(v, x, 650);
    text('TOTAL RM 560.00', 430, 625);
  } else {
    text('ISOLATED QA QUOTATION - Ref OLD-123 - 2024-08-12', 20, 760);
    text('We are pleased to quote you the following:', 20, 720);
    text('1. To supply one unit 5.0hp air-cond', 20, 680);
    text('Model: QA Example', 30, 660); text('RM 8,850.00', 450, 660);
    text('2. Pipe insulation and service', 20, 620); text('RM 1,100.00', 450, 620);
    text('including wiring work', 30, 600);
    text('TOTAL: RM 9,950.00', 420, 560);
  }
  return Buffer.from(await pdf.save());
}
(async () => {
  await fs.mkdir(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    const legacy = await makePdf(), table = await makePdf(true);
    for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }]) {
      for (const kind of ['quote', 'invoice']) {
        console.log('QA', kind, viewport.width);
        const context = await browser.newContext({ viewport });
        const page = await context.newPage(); page.setDefaultTimeout(30000);
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        const records = [], attachments = [], writes = [];
        let failAttachment = true;
        const pdf = kind === 'quote' ? legacy : table;
        await context.route('**/api/**', async route => {
          const req = route.request(), url = new URL(req.url());
          const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
          if (req.method() !== 'GET') writes.push(url.pathname);
          if (url.pathname === '/api/auth/me') return json({ id: customerId, displayName: '隔离 QA 管理员', role: 'owner' });
          if (url.pathname === '/api/customers') return json([{ id: customerId, name: '隔离 QA 客户', phone: '000', customerType: 'business' }]);
          if (url.pathname.includes('/reference-pdfs')) {
            if (url.pathname.endsWith('/file')) return route.fulfill({ contentType: 'application/pdf', body: pdf });
            if (req.method() === 'GET') return json(attachments);
            if (failAttachment) { failAttachment = false; return json({ detail: '参考原件存储尚未启用，请先执行已审核迁移。' }, 409); }
            const saved = { id: url.pathname.split('/').at(-1), fileName: 'QA-reference.pdf', contentType: 'application/pdf', fileSize: pdf.length, uploadedByName: 'QA', createdAt: '2026-10-15T00:00:00Z' };
            attachments.push(saved); return json(saved, 201);
          }
          if (url.pathname === `/api/${kind === 'quote' ? 'quotes' : 'invoices'}`) {
            if (req.method() === 'GET') return json(records);
            const input = req.postDataJSON();
            const saved = { ...input, id: documentId, customerName: '隔离 QA 客户', total: input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), createdAt: '2026-10-15T00:00:00Z' };
            records.push(saved); return json(saved, 201);
          }
          if (req.method() !== 'GET') throw new Error(`Unexpected write ${url.pathname}`);
          return json([]);
        });
        await page.goto(origin + (kind === 'quote' ? '/quotes' : '/invoices'));
        const noun = kind === 'quote' ? '报价' : '发票';
        await page.getByRole('button', { name: `新增${noun}`, exact: true }).first().click();
        await page.getByLabel(`${noun}编号`, { exact: true }).fill('QA-NEW-001');
        await page.getByLabel(kind === 'quote' ? '有效期至' : '到期日', { exact: true }).fill('2026-12-31');
        const customer = page.locator(kind === 'quote' ? '#quote-customer-search' : '#invoice-customer-search');
        await customer.fill('隔离 QA'); await page.getByRole('option').first().click();
        if (kind === 'quote') await page.locator('input[name="items.0.description"]').fill('Existing manual item');
        else { await page.getByRole('button', { name: '添加项目', exact: true }).click(); await page.locator('input[name="items.0.description"]').fill('Existing manual item'); }
        await page.locator('input[name="items.0.unitPrice"]').fill('10');
        await page.getByLabel('选择参考 PDF', { exact: true }).setInputFiles({ name: 'QA-reference.pdf', mimeType: 'application/pdf', buffer: pdf });
        await page.getByRole('heading', { name: '核对识别项目' }).waitFor();
        const rows = page.locator('.pdf-import-row');
        assert.equal(await rows.count(), 2);
        assert.equal(writes.length, 0);
        if (kind === 'quote') {
          assert.equal(await rows.nth(1).getByLabel('数量', { exact: true }).inputValue(), '');
          assert.equal(await rows.nth(1).getByLabel('单价（RM）', { exact: true }).inputValue(), '');
          await rows.nth(1).getByLabel('数量', { exact: true }).fill('1');
          await rows.nth(1).getByLabel('单价（RM）', { exact: true }).fill('1100');
        } else {
          assert.equal(await rows.first().getByLabel('数量', { exact: true }).inputValue(), '4');
          assert.equal(await rows.first().getByLabel('单价（RM）', { exact: true }).inputValue(), '120');
        }
        await rows.first().getByRole('textbox').fill('QA edited description');
        await page.getByRole('button', { name: '重试识别', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
        assert.equal(await rows.first().getByRole('textbox').inputValue(), 'QA edited description');
        await page.getByRole('checkbox', { name: /我已对照原件/ }).check();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(out, `${kind}-review-${viewport.width}.png`), fullPage: true });
        await page.locator('.pdf-item-import').screenshot({ path: path.join(out, `${kind}-review-panel-${viewport.width}.png`) });
        await page.getByRole('button', { name: '确认加入项目，保留已有内容', exact: true }).click();
        assert.equal(await page.locator('input[name="items.0.description"]').inputValue(), 'Existing manual item');
        assert.equal(await page.locator('input[name="items.1.description"]').inputValue(), 'QA edited description');
        await page.locator('input[name="items.1.quantity"]').fill('2');
        await page.locator('input[name="items.1.unitPrice"]').fill('125');
        assert.equal(await page.getByLabel(`${noun}编号`, { exact: true }).inputValue(), 'QA-NEW-001');
        assert.equal(writes.length, 0);
        await page.getByRole('button', { name: '取消', exact: true }).first().click();
        await page.getByRole('dialog').getByRole('button', { name: '继续编辑', exact: true }).click();
        await page.screenshot({ path: path.join(out, `${kind}-editable-${viewport.width}.png`), fullPage: true });
        await page.getByRole('button', { name: `保存${noun}`, exact: true }).click();
        await page.getByRole('button', { name: '重试保存参考原件', exact: true }).waitFor();
        assert.equal(records.length, 1); assert.equal(attachments.length, 0);
        assert.match(await page.locator('.customer-error').first().innerText(), /存储尚未启用/);
        if (kind === 'quote') assert(await page.evaluate(() => document.querySelector('.quote-save-actions').getBoundingClientRect().top - document.querySelector('.quote-total').getBoundingClientRect().bottom >= 16));
        assert.equal(await page.getByText(/尚未建立新单/).count(), 0);
        assert(await page.getByLabel(`${noun}编号`, { exact: true }).isDisabled());
        assert.equal(await page.getByRole('button', { name: '从旧 PDF 带入项目', exact: true }).isDisabled(), true);
        await page.screenshot({ path: path.join(out, `${kind}-retry-${viewport.width}.png`), fullPage: true });
        await page.getByRole('button', { name: '重试保存参考原件', exact: true }).click();
        await page.getByRole('heading', { name: `新增${noun}`, exact: true }).waitFor({ state: 'hidden' });
        assert.equal(await page.locator('.interaction-dialog[open]').count(), 0, 'successful save must clear the draft guard');
        assert.equal(records.length, 1); assert.equal(attachments.length, 1);
        assert.equal(records[0].items.length, 3);
        assert.equal(records[0].items[1].quantity, 2); assert.equal(records[0].items[1].unitPrice, 125);
        assert.equal(records[0].status, kind === 'quote' ? 'draft' : 'unpaid');
        assert.equal(writes.filter(url => url.endsWith('/quotes') || url.endsWith('/invoices')).length, 1);
        // Reopen the saved record and verify reference originals use their own viewer/download endpoints.
        if (kind === 'invoice') {
          await page.getByRole('button', { name: /更多操作：QA-NEW-001/ }).filter({ visible: true }).click();
          await page.getByRole('menuitem', { name: '编辑', exact: true }).click();
          await page.getByRole('heading', { name: '参考原件', exact: true }).waitFor();
          await page.getByRole('link', { name: '下载参考原件 QA-reference.pdf', exact: true }).waitFor();
        }
        assert.deepEqual(errors, []);
        results.push({ viewport, kind, passed: ['local text extraction', 'multi-line/multi-item recognition', 'missing numbers not guessed', 'confirmation before applying/re-recognition', 'existing content retained', 'editable values', 'no writes before save', 'leave guard', 'private reference failure retains file', 'retry does not duplicate document', 'no inferred payment', 'no horizontal overflow'] });
        await context.close();
      }
    }
    // Failed recognition and no-text PDFs preserve the file and protect navigation.
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage(); let writes = 0;
      await context.route('**/api/**', async route => {
        if (route.request().method() !== 'GET') { writes++; throw new Error('No save expected'); }
        const url = new URL(route.request().url());
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname === '/api/auth/me' ? { id: customerId, displayName: 'QA', role: 'owner' } : []) });
      });
      await context.route('**/assets/pdf.worker*', async route => { await new Promise(resolve => setTimeout(resolve, 1000)); await route.continue(); });
      await page.goto(origin + '/quotes');
      await page.getByRole('button', { name: '新增报价', exact: true }).first().click();
      await page.getByLabel('选择参考 PDF', { exact: true }).setInputFiles({ name: 'QA-broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 invalid') });
      await page.getByText('正在识别，请勿离开…', { exact: true }).waitFor();
      await page.getByRole('button', { name: '取消', exact: true }).first().click();
      await page.locator('.pdf-item-import [role="alert"]').waitFor();
      assert.match(await page.locator('.pdf-reference-name').innerText(), /QA-broken.pdf/);
      assert(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }));
      await page.getByRole('button', { name: '重试识别', exact: true }).click();
      await page.locator('.pdf-item-import [role="alert"]').waitFor();
      assert.match(await page.locator('.pdf-reference-name').innerText(), /QA-broken.pdf/);
      await page.getByRole('button', { name: '移除参考文件（已带入项目保留）', exact: true }).click();
      const fixture = await context.newPage(); await fixture.setContent('<h1>QA scanned image only</h1>');
      const raster = await fixture.screenshot(); await fixture.close();
      const scan = await PDFDocument.create(); const scanPage = scan.addPage([600, 800]);
      scanPage.drawImage(await scan.embedPng(raster), { x: 0, y: 0, width: 600, height: 800 });
      await page.getByLabel('选择参考 PDF', { exact: true }).setInputFiles({ name: 'QA-scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await scan.save()) });
      await page.getByText(/1 页没有文字层/).waitFor();
      assert.equal(await page.locator('.pdf-import-row').count(), 0); assert.equal(writes, 0);
      await page.screenshot({ path: path.join(out, 'scan-manual-390.png'), fullPage: true });
      results.push({ scenario: 'recognition failures', passed: ['busy leave blocked', 'beforeunload protected', 'invalid PDF retained across retry', 'scanned image produces no guessed rows', 'zero writes'] });
      await context.close();
    }
    // Optional real quotation: local extraction only, no upload/save and no private content in screenshots.
    if (process.env.QA_SAMPLE_PDF) {
      const context = await browser.newContext(); const page = await context.newPage();
      let writes = 0;
      await context.route('**/api/**', async route => {
        if (route.request().method() !== 'GET') { writes++; throw new Error('Sample must not be uploaded'); }
        const url = new URL(route.request().url());
        const data = url.pathname === '/api/auth/me' ? { id: customerId, displayName: 'QA', role: 'owner' }
          : url.pathname === '/api/customers' ? [{ id: customerId, name: 'QA', phone: '000' }] : [];
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto(origin + '/quotes');
      await page.getByRole('button', { name: '新增报价', exact: true }).first().click();
      await page.getByLabel('选择参考 PDF', { exact: true }).setInputFiles(process.env.QA_SAMPLE_PDF);
      await page.getByRole('heading', { name: '核对识别项目' }).waitFor();
      const rows = page.locator('.pdf-import-row'); assert.equal(await rows.count(), 2);
      assert.equal(await rows.first().getByLabel('数量', { exact: true }).inputValue(), '1');
      assert.equal(await rows.first().getByLabel('单价（RM）', { exact: true }).inputValue(), '8850');
      assert.equal(await rows.nth(1).getByLabel('数量', { exact: true }).inputValue(), '');
      assert.equal(await rows.nth(1).getByLabel('单价（RM）', { exact: true }).inputValue(), '');
      assert.match(await rows.nth(1).innerText(), /1100/); assert.equal(writes, 0);
      results.push({ sample: 'user-provided quotation', passed: ['two line items', 'explicit one unit', 'unstated quantity/price left blank', 'local extraction only; zero uploads'] });
      await context.close();
    }
    await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
