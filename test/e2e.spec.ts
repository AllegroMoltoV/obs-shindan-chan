import path from 'node:path'
import {
  type ElectronApplication,
  type Page,
  type JSHandle,
  _electron as electron,
} from 'playwright'
import type { BrowserWindow } from 'electron'
import {
  beforeAll,
  afterAll,
  describe,
  expect,
  test,
} from 'vitest'

const root = path.join(__dirname, '..')
let electronApp: ElectronApplication
let page: Page

if (process.platform === 'linux') {
  // pass ubuntu
  test(() => expect(true).true)
} else {
  beforeAll(async () => {
    electronApp = await electron.launch({
      args: ['.', '--no-sandbox'],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' },
    })
    page = await electronApp.firstWindow()

    const mainWin: JSHandle<BrowserWindow> = await electronApp.browserWindow(page)
    await mainWin.evaluate(async (win) => {
      win.webContents.executeJavaScript('console.log("Execute JavaScript with e2e testing.")')
    })
  })

  afterAll(async () => {
    await page.screenshot({ path: 'test/screenshots/e2e.png' })
    await page.close()
    await electronApp.close()
  })

  describe('[obs-shindan-chan] e2e tests', async () => {
    test('startup', async () => {
      const title = await page.title()
      expect(title).eq('OBS診断ちゃん')
    })

    test('should load the app header', async () => {
      const h1 = await page.$('h1')
      const title = await h1?.textContent()
      expect(title).contain('OBS診断ちゃん')
    })

    test('should show the platform selection copy', async () => {
      const bodyText = await page.textContent('body')
      expect(bodyText).contain('配信先ごとに、OBS の設定を見直しやすくするための診断アプリです。')
    })

    test('should keep back link compact on diagnosis page', async () => {
      await page.getByRole('button', { name: 'YouTube Live' }).click()

      const metrics = await page.locator('.back-link').evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const parentRect = element.parentElement?.getBoundingClientRect()
        return {
          width: rect.width,
          parentWidth: parentRect?.width ?? 0,
          text: element.textContent ?? '',
        }
      })

      expect(metrics.text).contain('配信先を選び直す')
      expect(metrics.width).lessThan(240)
      expect(metrics.parentWidth).greaterThan(metrics.width * 2)
    })
  })
}
