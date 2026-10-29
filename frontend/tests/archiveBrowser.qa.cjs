// Isolated browser QA: serves built frontend, intercepts EVERY /api request, never contacts Supabase.
// Usage: NODE_PATH=<bundled node_modules> node tests/archiveBrowser.qa.cjs
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist');
const out = path.resolve(__dirname, '../../output/archive-merged-qa');
const customerId = '51000000-0000-0000-0000-000000000001';
let fixturePdf;
const server = http.createServer(async (req, res) => {
  // Browser-native downloads may bypass Playwright routing; serve only the synthetic fixture locally.
  if (/^\/api\/document-archives\/(quote|invoice)\/[a-f0-9-]+\/file(?:\?download=true)?$/.test(req.url) && fixturePdf) {
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': req.url.includes('download=true') ? 'attachment; filename="QA-original.pdf"' : 'inline' }); res.end(fixturePdf); return;
  }
  if (req.url.startsWith('/api/')) { res.writeHead(503); res.end('QA requires API interception'); return; }
  try {
    const target = req.url.startsWith('/assets/') ? path.join(root, path.basename(req.url) && 'assets', path.basename(req.url)) : path.join(root, 'index.html');
    const mime = target.endsWith('.css') ? 'text/css' : /\.(js|mjs)$/.test(target) ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': mime }); res.end(await fs.readFile(target));
  } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await fs.mkdir(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    // This is an in-memory synthetic QA PDF, no user's document or live data.
    const fixturePage = await browser.newPage();
    await fixturePage.setContent('<h1>ISOLATED QA ONLY</h1><p>Invoice No: QA-2024-018</p><p>Invoice Date: 2024-08-12</p>');
    const pdf = await fixturePage.pdf(); fixturePdf = pdf; await fixturePage.close();
    const scanPage = await browser.newPage();
    await scanPage.setContent('<div style="padding:30px">ISOLATED SCANNED QA - 2024-08-12</div>');
    const raster = await scanPage.screenshot();
    await scanPage.setContent(`<img src="data:image/png;base64,${raster.toString('base64')}">`);
    const scannedPdf = await scanPage.pdf(); await scanPage.close();
    const results = [];
    for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }]) {
      for (const kind of ['quote', 'invoice']) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage(); page.setDefaultTimeout(10000);
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        let systemOnlyEmpty = false, failArchive = false;
        const archived = Array.from({ length: 23 }, (_, i) => ({ id: `51000000-0000-0000-0001-${String(i).padStart(12, '0')}`, kind,
          customerId, customerName: '隔离 QA 归档客户', originalNumber: `OLD-${String(i).padStart(2, '0')}`, originalDate: i === 22 ? null : '2024-08-12', fileName: `QA-original-${i}.pdf`, fileSize: pdf.length, createdAt: '2026-10-14T03:00:00Z' }));
        const systems = [1, 2].map(i => ({ id: `51000000-0000-0000-0002-${String(i).padStart(12, '0')}`, quoteNumber: `SYS-${i}`, invoiceNumber: `SYS-${i}`, customerName: '隔离 QA 系统客户', customerId,
          total: i * 100, amount: i * 100, dueDate: '2026-10-20', validUntil: '2026-10-20', status: kind === 'quote' ? 'sent' : 'unpaid', items: [], discount: 0, createdAt: '2026-10-13T00:00:00Z' }));
        const originalState = JSON.stringify({ archived, systems });
        const writes = [];
        await context.route('**/api/**', async route => {
          const request = route.request(); const url = new URL(request.url());
          const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
          if (request.method() !== 'GET') { writes.push(url.pathname); return json({}, 500); }
          if (url.pathname === '/api/auth/me') return json({ id: customerId, displayName: '隔离 QA 管理员', role: 'owner' });
          if (url.pathname.startsWith('/api/document-archives/')) return json(failArchive ? {} : archived, failArchive ? 503 : 200);
          if (url.pathname === `/api/${kind === 'quote' ? 'quotes' : 'invoices'}`) return json(systemOnlyEmpty ? [] : systems);
          return json([]);
        });
        const url = origin + (kind === 'quote' ? '/quotes' : '/invoices');
        await page.goto(url);
        const rows = () => page.locator('[data-source]:visible');
        await page.getByText('共 25 项 · 第 1 / 2 页', { exact: true }).waitFor();
        assert.equal(await rows().count(), 20);
        assert.equal(await page.locator('.archive-history').count(), 0);
        assert.equal(await page.getByText(kind === 'quote' ? '尚未有报价资料' : '尚未有发票资料', { exact: true }).count(), 0);
        await page.screenshot({ path: path.join(out, `${kind}-mixed-${viewport.width}.png`), fullPage: true });
        await page.screenshot({ path: path.join(out, `${kind}-mixed-viewport-${viewport.width}.png`) });
        if (viewport.width < 700) {
          await page.evaluate(() => window.scrollTo(0, 220));
          await page.screenshot({ path: path.join(out, `${kind}-mixed-mobile-rows.png`) });
        }
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.getByRole('button', { name: '下一页', exact: true }).click();
        await page.getByText('共 25 项 · 第 2 / 2 页', { exact: true }).waitFor(); assert.equal(await rows().count(), 5);
        const select = async (label, option) => {
          if (viewport.width < 700 && !await page.getByRole('button', { name: label, exact: true }).isVisible()) await page.getByRole('button', { name: /筛选／排序/ }).click();
          await page.getByRole('button', { name: label, exact: true }).click();
          await page.getByRole('menuitemradio', { name: option, exact: true }).click();
        };
        await select('来源', '历史归档');
        await page.getByText('共 23 项 · 第 1 / 2 页', { exact: true }).waitFor();
        assert.equal(await page.locator('[data-source="system"]:visible').count(), 0);
        await select('来源', '系统建立');
        await page.getByText('共 2 项 · 第 1 / 1 页', { exact: true }).waitFor();
        assert.equal(await page.locator('[data-source="archive"]:visible').count(), 0);
        assert.equal(await page.getByRole('button', { name: '更新 SYS-1 状态', exact: true }).count(), 1);
        await select('来源', '全部');
        await select('排序', '金额：从低到高');
        assert.match(await rows().first().innerText(), /SYS-1/);
        assert.match(await rows().nth(2).innerText(), /—/);
        await select('排序', '金额：从高到低'); assert.match(await rows().first().innerText(), /SYS-2/);
        await page.getByRole('searchbox', { name: kind === 'quote' ? '搜索报价' : '搜索发票', exact: true }).fill('QA-original-22.pdf');
        await page.getByText('共 1 项 · 第 1 / 1 页', { exact: true }).waitFor();
        assert.match(await rows().first().innerText(), /OLD-22/);
        await page.goto(url + (kind === 'quote' ? '?filter=sent' : '?filter=receivable'));
        await page.getByText('共 2 项 · 第 1 / 1 页', { exact: true }).waitFor();
        assert.equal(await page.locator('[data-source="archive"]:visible').count(), 0);
        systemOnlyEmpty = true; await page.goto(url);
        await page.getByText('共 23 项 · 第 1 / 2 页', { exact: true }).waitFor();
        assert.equal(await page.getByText(kind === 'quote' ? '尚未有报价资料' : '尚未有发票资料', { exact: true }).count(), 0);
        await page.screenshot({ path: path.join(out, `${kind}-archive-only-${viewport.width}.png`), fullPage: true });
        // Missing archive response cannot be represented as a known empty list.
        failArchive = true; await page.goto(url);
        await page.getByText('数量尚未加载', { exact: true }).waitFor();
        assert.equal(await page.getByText(kind === 'quote' ? '尚未有报价资料' : '尚未有发票资料', { exact: true }).count(), 0);
        assert.deepEqual(writes, []); assert.equal(JSON.stringify({ archived, systems }), originalState); assert.deepEqual(errors, []);
        results.push({ viewport, kind, passed: ['merged list and shared pagination', 'source filter resets page', 'search by original filename', 'unknown amount stays last', 'system actions retained', 'archive-only nonempty view', 'receivable/status excludes archives', 'failed load is not empty', 'filters perform no writes', 'no horizontal overflow'] });
        await context.close();
      }
    }
    for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage(); page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', e => errors.push(e.message));
      const records = [];
      let posts = 0, failNext = false, delayNext = false;
      await context.route('**/api/**', async route => {
        const req = route.request(); const url = new URL(req.url());
        const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname === '/api/auth/me') return json({ id: customerId, displayName: '隔离 QA 管理员', email: 'qa@example.invalid', role: 'owner' });
        if (url.pathname === '/api/customers') return json([{ id: customerId, name: '隔离 QA 客户（非真实资料）', phone: '', customerType: 'business' }]);
        if (url.pathname.startsWith('/api/document-archives/')) {
          const kind = url.pathname.split('/')[3];
          if (url.pathname.endsWith('/file')) return route.fulfill({ contentType: 'application/pdf', body: pdf,
            headers: { 'Content-Disposition': url.searchParams.get('download') ? 'attachment; filename="QA-original.pdf"' : 'inline' } });
          if (req.method() === 'GET') return json(records.filter(x => x.kind === kind));
          posts++;
          if (delayNext) { delayNext = false; await new Promise(resolve => setTimeout(resolve, 1200)); }
          if (failNext) { failNext = false; return json({ detail: 'Isolated failure' }, 502); }
          const body = req.postDataBuffer().toString('utf8');
          const field = name => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1] || '';
          if (field('originalNumber') === 'QA-2024-018' && field('confirmDuplicate') !== 'true') return json({ detail: '原编号重复' }, 422);
          const id = url.pathname.split('/').at(-1);
          const saved = { id, kind, customerId, customerName: '隔离 QA 客户（非真实资料）', originalNumber: field('originalNumber') || null, originalDate: field('originalDate') || null, fileName: 'QA-original.pdf', fileSize: pdf.length, createdAt: '2026-10-14T03:00:00Z' };
          if (!records.some(x => x.id === id)) records.push(saved);
          return json(saved, 201);
        }
        if (req.method() !== 'GET') throw new Error('Unexpected business write: ' + url.pathname);
        return json([]);
      });
      await page.goto(origin + '/invoices');
      await page.getByRole('button', { name: '上传旧单据归档', exact: true }).click();
      await page.getByLabel('选择历史原件 PDF').setInputFiles({ name: 'QA-original.pdf', mimeType: 'application/pdf', buffer: pdf });
      await page.getByText(/已读取文字层/).waitFor();
      assert.equal(await page.getByLabel('原单据编号（选填）').inputValue(), 'QA-2024-018');
      assert.equal(await page.getByLabel('原单据日期（选填）').inputValue(), '2024-08-12');
      await page.getByLabel('所属客户（必填）').selectOption(customerId);
      // Search is display-only even while an upload draft contains a selected PDF.
      const searchBox = page.locator('.list-search input');
      await searchBox.scrollIntoViewIfNeeded(); await searchBox.click();
      const searchY = await page.evaluate(() => scrollY);
      for (const letter of 'QA') {
        await searchBox.pressSequentially(letter, { delay: 80 });
        await page.waitForTimeout(150);
        assert.equal(await searchBox.evaluate(element => document.activeElement === element), true);
        assert(Math.abs(await page.evaluate(() => scrollY) - searchY) <= 2, 'Search must not jump to page heading');
        assert.equal(await page.locator('.interaction-dialog[open]').count(), 0);
      }
      assert.equal(await page.getByLabel('原单据编号（选填）').inputValue(), 'QA-2024-018');
      assert.equal(await page.locator('.attachment-pending-list').count(), 1);
      await page.screenshot({ path: path.join(out, `upload-search-stable-${viewport.width}.png`) });
      await page.screenshot({ path: path.join(out, `invoice-form-${viewport.width}.png`), fullPage: true });
      if (viewport.width < 700) {
        await page.getByRole('button', { name: '保存归档', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(out, 'invoice-form-mobile-fields.png') });
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
      // Leaving protects selected original and input.
      await page.locator('.archive-form').getByRole('button', { name: '取消', exact: true }).click();
      await page.getByRole('button', { name: '继续编辑', exact: true }).click();
      await page.getByRole('button', { name: '保存归档', exact: true }).click();
      await page.getByRole('button', { name: '确认另存', exact: true }).click();
      await page.getByText('历史原件已归档，不计入欠款或收入，不改变付款状态。').waitFor();
      assert.equal(posts, 2); assert.equal(records.length, 1);
      await page.screenshot({ path: path.join(out, `invoice-history-${viewport.width}.png`), fullPage: true });
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('link', { name: '下载原件', exact: true }).click();
      const download = await downloadEvent;
      assert.equal(download.suggestedFilename(), 'QA-original.pdf');
      const viewUrl = await page.getByRole('link', { name: '查看原 PDF', exact: true }).getAttribute('href');
      assert.equal(await page.evaluate(async url => (await fetch(url)).headers.get('content-type'), viewUrl), 'application/pdf');
      // Blank optional metadata + upload failure + same-file retry.
      await page.getByRole('button', { name: '上传旧单据归档', exact: true }).click();
      await page.getByLabel('选择历史原件 PDF').setInputFiles({ name: 'QA-original.pdf', mimeType: 'application/pdf', buffer: pdf });
      await page.getByText(/已读取文字层/).waitFor();
      await page.getByLabel('所属客户（必填）').selectOption(customerId);
      await page.getByLabel('原单据编号（选填）').fill(''); await page.getByLabel('原单据日期（选填）').fill('');
      failNext = true; delayNext = true; await page.getByRole('button', { name: '保存归档', exact: true }).click();
      assert.equal(await page.locator('.archive-form').getByRole('button', { name: '取消', exact: true }).isDisabled(), true);
      assert.equal(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented }), true);
      await page.getByRole('button', { name: '重试保存归档', exact: true }).waitFor();
      assert.equal(await page.locator('.attachment-pending-list').count(), 1);
      await page.getByRole('button', { name: '重试保存归档', exact: true }).click();
      await page.locator('[data-source="archive"]:visible').filter({ hasText: '原编号未填写' }).waitFor();
      assert.equal(records.length, 2); assert.equal(records[1].originalDate, null);
      await page.goto(origin + '/quotes');
      await page.getByRole('button', { name: '上传旧单据归档', exact: true }).click();
      await page.getByRole('heading', { name: '上传旧报价归档' }).waitFor();
      const quoteSearch = page.locator('.list-search input');
      await quoteSearch.scrollIntoViewIfNeeded(); await quoteSearch.click();
      const quoteSearchY = await page.evaluate(() => scrollY);
      await quoteSearch.pressSequentially('diam', { delay: 100 }); await page.waitForTimeout(150);
      assert.equal(await quoteSearch.evaluate(element => element === document.activeElement), true);
      assert(Math.abs(await page.evaluate(() => scrollY) - quoteSearchY) <= 2, 'Quote search must stay focused below upload');
      await page.screenshot({ path: path.join(out, `quote-upload-search-stable-${viewport.width}.png`) });

      await page.screenshot({ path: path.join(out, `quote-form-${viewport.width}.png`), fullPage: true });
      // Drag/drop a raster-only PDF: never invent number/date from an image.
      await page.locator('.archive-drop').evaluate((element, base64) => {
        const data = new DataTransfer();
        data.items.add(new File([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], 'QA-scan.pdf', { type: 'application/pdf' }));
        element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: data }));
      }, scannedPdf.toString('base64'));
      await page.getByText(/未读取到文字层/).waitFor();
      assert.equal(await page.getByLabel('原单据编号（选填）').inputValue(), '');
      assert.equal(await page.getByLabel('原单据日期（选填）').inputValue(), '');
      await page.getByRole('button', { name: '移除待上传文件 QA-scan.pdf', exact: true }).click();
      // Failed parsing keeps the selected file and supports repeat recognition.
      await page.getByLabel('选择历史原件 PDF').setInputFiles({ name: 'QA-broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nbroken\n%%EOF') });
      await page.getByText(/识别失败（可能损坏或有密码）/).waitFor();
      await page.getByRole('button', { name: '重试识别', exact: true }).click();
      await page.getByText(/识别失败（可能损坏或有密码）/).waitFor();
      assert.equal(await page.locator('.attachment-pending-list').count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      results.push({ viewport, passed: ['text extraction', 'duplicate confirmation', 'leave protection', 'busy beforeunload guard', 'typing below upload preserves scroll focus and draft', 'blank optional fields', 'upload failure retains original', 'same-file retry UI', 'quote entry', 'drag/drop scanned PDF without guessed metadata', 'recognition failure and retry', 'view and download entries', 'no horizontal overflow'], browserErrors: errors });
      await context.close();
    }
    await fs.writeFile(path.join(out, 'browser-results.json'), JSON.stringify({ environment: 'Isolated mocked API; no live system writes', results }, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } catch (error) { for (const context of browser.contexts()) for (const page of context.pages()) { console.error(await page.evaluate(() => ({ url: location.href, dialogs: [...document.querySelectorAll('dialog[open]')].map(x => x.textContent), active: document.activeElement?.outerHTML, body: document.body.innerText.slice(-1500) }))); } console.error(error); throw error; } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
