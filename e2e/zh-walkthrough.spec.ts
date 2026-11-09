import { expect, test, type Browser, type Page } from '@playwright/test'
import { setIntOption, setSelectOption } from './helpers.ts'

// e7-t08 (AC-7.3): the site in Traditional Chinese, screen by screen, with nothing left in English.
// The list of screens is docs/ZH-WALKTHROUGH.md. It reads what is on the screen and what a screen
// reader gets, which check-i18n cannot. It cannot tell a bad translation from a good one: read those.

// Words that stay Latin in both languages. Nicknames here are Chinese, so that they need no entry
// Overtrick is the bridge table's platform, whose name is English only (its DESIGN.md §6; e1-t13)
const ALLOWED = /TKU Arcade|Overtrick|\bEN\b|QR code|Shift\+Enter|\bEnter\b/g

async function englishLeft(page: Page): Promise<string[]> {
  return page.evaluate((allowed) => {
    const found = new Set<string>()
    const check = (text: string | null) => {
      const rest = (text ?? '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(new RegExp(allowed, 'g'), '')
      if (/[A-Za-z]{2,}/.test(rest)) found.add(rest.trim().slice(0, 80))
    }
    const shown = (element: Element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      // The clipped 1px of VisuallyHidden still counts: a screen reader reads it
      return box.width > 0 && style.visibility !== 'hidden'
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement
      if (!parent || ['SCRIPT', 'STYLE', 'OPTION'].includes(parent.tagName)) continue
      // <title> in an SVG has no box of its own
      if (parent.tagName === 'title' || shown(parent)) check(walker.currentNode.textContent)
    }
    for (const element of document.querySelectorAll('body *')) {
      for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) {
        check(element.getAttribute(attribute))
      }
    }
    for (const option of document.querySelectorAll('option')) check(option.textContent)
    return [...found]
  }, ALLOWED.source)
}

async function expectAllChinese(page: Page, screen: string) {
  await expect(page.locator('html'), screen).toHaveAttribute('lang', 'zh-TW')
  expect(await englishLeft(page), screen).toEqual([])
}

const nicknameBox = (page: Page) => page.getByRole('textbox', { name: '暱稱' })

async function person(browser: Browser, viewport: { width: number; height: number }, touch: boolean) {
  const context = await browser.newContext({
    locale: 'zh-TW',
    viewport,
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: 'reduce',
  })
  return context.newPage()
}

test('the check itself sees English when there is some', async ({ browser }) => {
  const page = await browser.newPage({ locale: 'en-US' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New room' })).toBeVisible()
  expect(await englishLeft(page)).toContain('New room')
  await page.close()
})

for (const [label, viewport, touch] of [
  ['phone', { width: 375, height: 667 }, true],
  ['desktop', { width: 1280, height: 800 }, false],
] as const) {
  test.describe(`zh-TW, ${label}`, () => {
    test('the lobby, its errors and the rules page', async ({ browser }) => {
      const page = await person(browser, viewport, touch)
      await page.goto('/')
      await expect(page.getByRole('button', { name: '建立房間' })).toBeVisible()
      await expectAllChinese(page, 'lobby')

      await page.getByRole('textbox', { name: '有連結？貼在這裡' }).fill('nope')
      await page.getByRole('textbox', { name: '有連結？貼在這裡' }).press('Enter')
      await expect(page.getByRole('alert')).toBeVisible()
      await expectAllChinese(page, 'bad link')

      await page.getByRole('button', { name: '建立房間' }).click()
      await nicknameBox(page).press('Enter')
      await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
      await expectAllChinese(page, 'nickname dialog with its error')
      await page.getByRole('button', { name: '關閉' }).click()

      await page.getByRole('link', { name: '陞官圖怎麼玩' }).click()
      await expect(page.getByRole('heading', { name: '目標' })).toBeVisible()
      await expectAllChinese(page, 'rules page')

      await page.goto('/no/such/page')
      await expect(page.getByRole('heading', { name: '找不到頁面' })).toBeVisible()
      await expectAllChinese(page, 'unknown address')

      await page.goto('/r/AAAAAAAAAA')
      await expect(page.getByRole('heading', { name: '找不到房間' })).toBeVisible()
      await expectAllChinese(page, 'room not found')
      await page.context().close()
    })

    test('a room from the waiting room to the result', async ({ browser }) => {
      test.setTimeout(120_000)
      const host = await person(browser, viewport, touch)
      const guest = await person(browser, viewport, touch)

      await host.goto('/')
      await host.getByRole('button', { name: '建立房間' }).click()
      await nicknameBox(host).fill('小安')
      await nicknameBox(host).press('Enter')
      await host.waitForURL(/\/r\//)
      await expect(host.getByRole('heading', { name: '座位', exact: true })).toBeVisible()
      await expectAllChinese(host, 'waiting room, alone')

      await guest.goto(host.url())
      await expect(nicknameBox(guest)).toBeVisible()
      await expectAllChinese(guest, 'entering a room')
      await nicknameBox(guest).fill('小博')
      await nicknameBox(guest).press('Enter')
      await expect(host.getByText('小博')).toBeVisible()
      await expectAllChinese(host, 'waiting room, host')
      await expectAllChinese(guest, 'waiting room, guest')

      for (const [button, title] of [
        ['踢出 小博', '要踢出 小博 嗎？'],
        ['轉移房主：小博', '要把房主轉移給 小博 嗎？'],
        ['解散房間', '要解散這個房間嗎？'],
      ]) {
        await host.getByRole('button', { name: button }).click()
        const dialog = host.getByRole('dialog', { name: title })
        await expect(dialog).toBeVisible()
        await expectAllChinese(host, title)
        await dialog.getByRole('button', { name: '取消' }).click()
      }

      await host.getByRole('button', { name: '怎麼玩' }).click()
      const rules = host.getByRole('dialog', { name: '陞官圖怎麼玩' })
      await expect(rules.getByRole('heading', { name: '目標' })).toBeVisible()
      await expectAllChinese(host, 'how to play')
      await rules.getByRole('button', { name: '關閉' }).click()

      // The shortest game there is, so that it reaches the result in reasonable time
      const limit = host.getByRole('spinbutton', { name: '回合上限' })
      await limit.fill('10')
      await limit.press('Enter')
      await expect(guest.getByText('10', { exact: true })).toBeVisible()

      await host.getByRole('button', { name: '開始遊戲' }).click()
      await expect(host.locator('[data-cell]')).toHaveCount(79)
      await expectAllChinese(host, 'in play')
      await expectAllChinese(guest, 'in play, guest')

      await host.locator('[data-cell="juren"]').click()
      await expect(host.getByRole('heading', { level: 3 })).toContainText('舉人')
      await expectAllChinese(host, 'a cell explained')

      if (touch) {
        await host.getByRole('button', { name: '成員', exact: true }).click()
        const drawer = host.getByRole('dialog')
        await expect(drawer.getByText('小博').first()).toBeVisible()
        await expectAllChinese(host, 'members drawer')
        await drawer.getByRole('button', { name: '關閉' }).click()
        await host.getByRole('button', { name: '聊天', exact: true }).click()
      }
      const box = host.getByRole('textbox', { name: '傳給房間的訊息' })
      await box.fill('大家好')
      await host.getByRole('button', { name: '傳送' }).click()
      await expect(host.getByText('大家好')).toBeVisible()
      await expectAllChinese(host, 'chat')
      if (touch) await host.getByRole('dialog').getByRole('button', { name: '關閉' }).click()

      // Both roll until it is over; one roll at a time, whoever's turn it is
      const over = host.getByRole('region', { name: '結果' })
      for (let roll = 0; roll < 60 && !(await over.isVisible()); roll++) {
        for (const page of [host, guest]) {
          const button = page.getByRole('button', { name: '擲骰', exact: true })
          if (
            (await button.isVisible()) &&
            (await button.getAttribute('aria-disabled')) === 'false'
          ) {
            await button.click()
          }
        }
        await host.waitForTimeout(150)
      }
      await expect(over).toBeVisible({ timeout: 10_000 })
      // Equal seniority shares a place, so there can be two of them
      await expect(over.getByText('第 1 名').first()).toBeVisible()
      await expectAllChinese(host, 'result, host')
      await expectAllChinese(guest, 'result, guest')

      await over.getByRole('button', { name: '回到等待室' }).click()
      await expect(host.getByRole('heading', { name: '座位', exact: true })).toBeVisible()

      await host.getByRole('button', { name: '解散房間' }).click()
      await host.getByRole('dialog').getByRole('button', { name: '解散房間' }).click()
      await expect(guest.getByRole('alert')).toBeVisible()
      await expectAllChinese(guest, 'room dissolved')

      await host.context().close()
      await guest.context().close()
    })

    test('Silent Table, from the rules to the result', async ({ browser }) => {
      test.setTimeout(120_000)
      const names = ['小安', '小博', '小綺']
      const people: Page[] = []
      for (const name of names) {
        const page = await person(browser, viewport, touch)
        if (people.length === 0) {
          const response = await page.request.post('/api/rooms', { data: { gameId: 'silent-table' } })
          const { id } = (await response.json()) as { id: string }
          await page.goto(`/r/${id}`)
        } else {
          await page.goto(people[0].url())
        }
        await nicknameBox(page).fill(name)
        await nicknameBox(page).press('Enter')
        await expect(page.getByRole('heading', { name: '座位', exact: true })).toBeVisible()
        people.push(page)
      }
      const [host] = people

      await host.goto('/games/silent-table/rules')
      await expect(host.getByRole('heading', { name: '目標' })).toBeVisible()
      await expectAllChinese(host, 'Silent Table rules page')
      await host.goBack()
      await expect(host.getByRole('heading', { name: '座位', exact: true })).toBeVisible()

      await expectAllChinese(host, 'Silent Table waiting room, its options')
      await expectAllChinese(people[1], 'Silent Table waiting room, guest')
      for (const [label, value] of [
        ['連過幾關獲勝', '1'],
        ['失敗幾關算輸', '1'],
      ]) {
        await setIntOption(host, people[1], label, value)
      }
      await setSelectOption(host, people[1], '每輪時間', '120', '120 秒')
      await setSelectOption(host, people[1], '牌桌主題', 'diving', '潛水隊')

      await host.getByRole('button', { name: '開始遊戲' }).click()
      await expect(host.getByRole('group', { name: '順位籌碼' })).toBeVisible()
      await expect(host.getByText('現在不能講話')).toBeVisible()
      await expectAllChinese(host, 'Silent Table in play')
      await expect(host.getByRole('timer')).toBeVisible()
      await expectAllChinese(host, 'Silent Table with its countdown')

      for (let round = 0; round < 3; round++) {
        for (const page of people) {
          // Again if somebody else's move had not reached this person yet
          await expect(async () => {
            await page.getByRole('button', { name: /^拿籌碼 \d+$/ }).first().click()
            await expect(page.getByRole('button', { name: /在你手上$/ })).toBeVisible({ timeout: 1000 })
          }).toPass({ timeout: 15_000 })
        }
        await expectAllChinese(host, 'Silent Table, chips taken')
        for (const page of people) {
          await page.getByRole('button', { name: '準備好了', exact: true }).click()
        }
        if (round < 2) await expect(host.getByText(`第 ${round + 2}/3 輪`)).toBeVisible()
      }

      const over = host.getByRole('region', { name: '結果' })
      await expect(over).toBeVisible()
      await expect(over.getByText('名')).toHaveCount(0)
      await expectAllChinese(host, 'Silent Table reveal and result')
      for (const page of people) await page.context().close()
    })
  })
}
