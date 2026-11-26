import { expect, test, type Page, type Request } from '@playwright/test';
import { installFolder, readFile, readTree, sha256, writeFile } from './engineeringSupport';
import { setup } from './support';

const FOCUS_RGB = 'rgb(47, 128, 201)';

async function openBundle(page: Page) {
  await page.goto('./#/engineering/review');
  await installFolder(page);
  await page.getByRole('button', { name: 'Open bundle folder' }).click();
  await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
}

test.describe('engineering workspace', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('review loop: pin, item file, checkbox, Claude reply, regenerated model, graph, no network', async ({ page }) => {
    const requests: Request[] = [];
    const violations: string[] = [];
    page.on('console', (m) => { if (/Content Security Policy|violates the following/i.test(m.text())) violations.push(m.text()); });
    page.on('pageerror', (e) => violations.push(`pageerror: ${e.message}`));
    await setup(page);
    await page.goto('./#/engineering/review');
    await page.waitForLoadState('networkidle');
    page.on('request', (r) => requests.push(r)); // from here on: everything the Engineering workspace does
    await installFolder(page);
    await page.getByRole('button', { name: 'Open bundle folder' }).click();
    await expect(page.getByText('Dummy L-bracket (invented data)')).toBeVisible();
    await expect(page.getByRole('button', { name: /^R-0001 / })).toBeVisible();
    await expect(page.getByRole('button', { name: /^R-0002 / })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pin 1, R-0001/ })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /bracket-arm/ })).toBeChecked();

    // 2. drop a pin, write an item, tick the checkbox
    await page.getByRole('button', { name: 'Drop pin' }).click();
    const box = (await page.locator('canvas').boundingBox())!;
    let placed = false;
    for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7, 0.45, 0.55]) for (const fy of [0.5, 0.6, 0.4, 0.7, 0.3, 0.55, 0.45]) {
      if (placed) break;
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      placed = await page.getByRole('heading', { name: /New review item/ }).isVisible();
      if (!placed) await page.getByRole('button', { name: 'Drop pin' }).click().catch(() => undefined);
    }
    expect(placed).toBe(true);
    await page.getByLabel('Title').fill('Check the hole spacing');
    await page.getByLabel('Comment').fill('Holes look close to the edge.');
    await page.getByRole('button', { name: 'Save item' }).click();
    await expect(page.getByText('Check the hole spacing')).toBeVisible();
    const item = JSON.parse(await readFile(page, 'review/R-0003.json'));
    expect(item).toMatchObject({ schema: 'review/0.1', id: 'R-0003', status: 'open', checked: false, rev: 1 });
    expect(item.anchor.point).toHaveLength(3);
    expect(item.anchor.camera.fov).toBe(45);
    expect(item.thread[0]).toMatchObject({ author: 'santiago', text: 'Holes look close to the edge.' });
    await page.getByRole('checkbox', { name: /R-0003/ }).click();
    await expect.poll(async () => JSON.parse(await readFile(page, 'review/R-0003.json')).checked).toBe(true);
    expect(JSON.parse(await readFile(page, 'review/R-0003.json')).rev).toBe(2);
    await expect(page.getByRole('checkbox', { name: /R-0003/ })).toBeChecked();

    // 3. Claude replies in the file; the tab shows it without a reload
    const r1 = JSON.parse(await readFile(page, 'review/R-0001.json'));
    await writeFile(page, 'review/R-0001.json', JSON.stringify({
      ...r1, status: 'agent_replied', rev: r1.rev + 1, updated: new Date().toISOString(),
      thread: [...r1.thread, { author: 'claude', at: new Date().toISOString(), text: 'Raised the radius to 3 mm and regenerated the model.', links: ['calcs/c-001.json'] }],
    }, null, 2));
    await page.getByRole('button', { name: /^R-0001 / }).click();
    await expect(page.getByText('Raised the radius to 3 mm and regenerated the model.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Claude replied').first()).toBeVisible();
    await expect(page.getByText('Files: calcs/c-001.json')).toBeVisible();

    // 4. a regenerated model replaces the old one in place
    const tree = readTree(); const glb = tree.find((f) => f.path === 'models/bracket.glb')!;
    const bytes = Buffer.from(glb.b64, 'base64'); bytes[bytes.length - 8] = bytes[bytes.length - 8]! ^ 1;
    const changed = bytes.toString('base64');
    const manifest = JSON.parse(await readFile(page, 'manifest.json'));
    manifest.files.find((f: { path: string }) => f.path === 'models/bracket.glb').sha256 = sha256(changed);
    const before = await page.locator('[data-model-sha]').getAttribute('data-model-sha');
    await writeFile(page, 'models/bracket.glb', { b64: changed });
    await writeFile(page, 'manifest.json', JSON.stringify(manifest, null, 2));
    await expect(page.locator('[data-model-sha]')).not.toHaveAttribute('data-model-sha', before!, { timeout: 10_000 });
    await expect(page.getByText('does not match the hash')).toHaveCount(0);
    await expect(page.getByText('Raised the radius to 3 mm')).toBeVisible(); // still on the same page, state kept

    // 5. a stale write is refused
    await writeFile(page, 'review/R-0002.json', JSON.stringify({ ...JSON.parse(await readFile(page, 'review/R-0002.json')), rev: 9 }, null, 2));
    await page.getByRole('checkbox', { name: /R-0002/ }).click();
    await expect(page.getByText('This item changed. Reload to see the update.')).toBeVisible();

    // 6. trace graph
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Trace graph' }).click();
    await expect(page.getByRole('heading', { name: 'Trace graph', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gaps (1)' })).toBeVisible();
    await expect(page.getByText('DEMO-DO-002').first()).toBeVisible();
    await expect(page.getByText('No verification').first()).toBeVisible();
    await page.getByRole('button', { name: /DEMO-DI-001/ }).click();
    const chain = page.getByText(/^Chain:/);
    await expect(chain).toContainText('DEMO-UN-001');
    for (const id of ['DEMO-DO-001', 'DEMO-DO-002', 'DEMO-VER-001']) await expect(chain).toContainText(id);
    await expect(chain).not.toContainText('DEMO-UN-002');
    await expect(chain).not.toContainText('DEMO-VER-002');

    expect(violations).toEqual([]); // the Content Security Policy blocked nothing and nothing threw

    // 7. nothing but this origin's own static files was requested while the workspace ran
    const kinds = requests.map((r) => `${r.resourceType()} ${new URL(r.url()).origin}`);
    const bad = requests.filter((r) => !['script', 'stylesheet', 'font', 'image', 'document', 'manifest', 'other'].includes(r.resourceType()) || new URL(r.url()).origin !== 'http://localhost:4173');
    expect(bad.map((r) => `${r.method()} ${r.resourceType()} ${r.url()}`), JSON.stringify(kinds)).toEqual([]);
  });

  test('keyboard reaches tabs, sidebar items, pins and queue items with the focus ring', async ({ page }) => {
    await setup(page);
    await openBundle(page);
    const seen = new Set<string>(); const bad: string[] = [];
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    for (let i = 0; i < 90; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement; const cs = getComputedStyle(el);
        return { name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? '', tag: el.tagName, width: cs.outlineWidth, color: cs.outlineColor, style: cs.outlineStyle, inTabs: !!el.closest('nav[aria-label="Workspaces"]'), inMain: !!el.closest('nav[aria-label="Main"]') };
      });
      seen.add(info.name);
      if (info.tag !== 'BODY' && (info.width !== '3px' || info.color !== FOCUS_RGB || info.style === 'none')) bad.push(`${info.name}: ${info.width} ${info.color} ${info.style}`);
    }
    for (const want of ['Engineering', 'Review', 'Trace graph', 'R-0001: Root fillet looks tight', 'Drop pin']) expect([...seen].some((s) => s.includes(want)), `focus reached ${want}`).toBe(true);
    expect([...seen].some((s) => s.includes('Root fillet looks tight')), 'queue item reached').toBe(true);
    expect([...seen].some((s) => s.includes('Seen: R-0001')), 'queue checkbox reached').toBe(true);
    expect(bad).toEqual([]);
  });

  test('no serious axe violations on Review and Trace graph', async ({ page }) => {
    await setup(page);
    await openBundle(page);
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    for (const path of ['review', 'graph']) {
      await page.goto(`./#/engineering/${path}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(500);
      const r = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${path}: ${v.id} ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
    }
  });

  test('an unknown major version is refused with a clear message', async ({ page }) => {
    await setup(page);
    await page.goto('./#/engineering/review');
    const tree = readTree().map((f) => f.path === 'manifest.json' ? { ...f, b64: Buffer.from(Buffer.from(f.b64, 'base64').toString().replace('manifest/0.1', 'manifest/1.0')).toString('base64') } : f);
    await installFolder(page, tree);
    await page.getByRole('button', { name: 'Open bundle folder' }).click();
    await expect(page.getByRole('alert')).toContainText('manifest version 1.0. This app reads version 0.x');
  });

  test('without the folder picker the folder opens read-only', async ({ page }) => {
    await setup(page);
    await page.addInitScript(() => { delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker; });
    await page.goto('./#/engineering/review');
    await expect(page.getByText('This browser cannot open a folder for writing')).toBeVisible();
    const dir = (await import('node:path')).resolve('fixtures');
    await page.locator('input[type=file]').setInputFiles(dir + '/dummy-bracket');
    await expect(page.getByText('This folder is open read-only')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add item without a pin' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^R-0001 / })).toBeVisible();
  });
});
