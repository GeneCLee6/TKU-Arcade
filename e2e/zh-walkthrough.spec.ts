import { expect, test, type Browser, type Page } from '@playwright/test'
import { everyoneReady, setIntOption, setSelectOption, takeFirstChip } from './helpers.ts'

// e7-t08 (AC-7.3): the site in Traditional Chinese, screen by screen, with nothing left in English.
// The list of screens is docs/ZH-WALKTHROUGH.md. It reads what is on the screen and what a screen
// reader gets, which check-i18n cannot. It cannot tell a bad translation from a good one: read those.

// Words that stay Latin in both languages. Nicknames here are Chinese, so that they need no entry
// Overtrick is the bridge table's platform, whose name is English only (its DESIGN.md §6; e1-t13)
// The originals' own names, in the one sentence a rules page gives them (CLAUDE.md rule 1)
const ALLOWED =
  /TKU Arcade|Overtrick|\bEN\b|QR code|Shift\+Enter|\bEnter\b|9upper|TIME2PLAY GAMES|\bito\b|Arclight/g

async function englishLeft(page: Page): Promise<string[]> {
  return page.evaluate((allowed) => {
    const found = new Set<string>()
    const check = (text: string | null) => {
      const rest = (text ?? '').replace(/https?:\/\/\S+/g, '').replace(new RegExp(allowed, 'g'), '')
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
      // Data, not words: a room's id says translate="no" (E1)
      if (parent.closest('[translate="no"]')) continue
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

async function person(
  browser: Browser,
  viewport: { width: number; height: number },
  touch: boolean,
) {
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
  await expect(page.getByRole('button', { name: 'New room' }).first()).toBeVisible()
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
      await expect(page.getByRole('button', { name: '建立房間' }).first()).toBeVisible()
      await expectAllChinese(page, 'lobby')

      await page.getByRole('textbox', { name: '有房號或連結？' }).fill('nope')
      await page.getByRole('textbox', { name: '有房號或連結？' }).press('Enter')
      await expect(page.getByRole('alert')).toBeVisible()
      await expectAllChinese(page, 'bad link')

      await page.getByRole('button', { name: '建立房間' }).first().click()
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
      await host.getByRole('button', { name: '建立房間' }).first().click()
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
      const sheet = host.getByRole('dialog')
      await expect(sheet.getByRole('heading')).toContainText('舉人')
      await expectAllChinese(host, 'a cell explained')
      await sheet.getByRole('button', { name: '關閉' }).click()
      await expect(sheet).toBeHidden()

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
          const response = await page.request.post('/api/rooms', {
            data: { gameId: 'silent-table' },
          })
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

      const labels = { take: /^拿籌碼 \d+$/, yours: /在你手上$/, ready: '準備好了' }
      for (let round = 0; round < 3; round++) {
        for (const [index, page] of people.entries()) {
          await takeFirstChip(page, people.length - index, labels)
        }
        await expectAllChinese(host, 'Silent Table, chips taken')
        await everyoneReady(people, labels)
        if (round < 2) await expect(host.getByText(`第 ${round + 2}/3 輪`)).toBeVisible()
      }

      const over = host.getByRole('region', { name: '結果' })
      await expect(over).toBeVisible()
      await expect(over.getByText('名')).toHaveCount(0)
      await expectAllChinese(host, 'Silent Table reveal and result')
      for (const page of people) await page.context().close()
    })

    // e7-t13: the M1 games and I3/I4's room parts, walked again in Chinese
    async function roomOf(gameId: string, names: readonly string[]) {
      const people: Page[] = []
      for (const name of names) {
        const page = await person(browser_, viewport, touch)
        if (people.length === 0) {
          const response = await page.request.post('/api/rooms', { data: { gameId } })
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
      return people
    }
    let browser_: Browser

    test('Bluff Reader, from the rules to the result, with reactions and the replay', async ({
      browser,
    }) => {
      test.setTimeout(150_000)
      browser_ = browser
      const people = await roomOf('bluff', ['小安', '小博', '小綺'])
      const [host] = people
      await host.goto('/games/bluff/rules')
      await expect(host.getByRole('heading', { name: '真假朗讀是什麼？' })).toBeVisible()
      await expectAllChinese(host, 'Bluff Reader rules page')
      await host.goBack()
      await expect(host.getByRole('heading', { name: '座位', exact: true })).toBeVisible()
      await expectAllChinese(host, 'Bluff Reader waiting room')

      // The host's room password setting, and the reactions open
      await expect(host.getByLabel('房間密碼（選填）')).toBeVisible()
      await host.getByRole('button', { name: '表情' }).click()
      await expectAllChinese(host, 'reactions open, password setting')
      await host.getByRole('button', { name: '拍手' }).click()
      await expect(people[1].getByText('小安').last()).toBeVisible()

      await host.getByRole('button', { name: '開始遊戲' }).click()
      for (let round = 1; round <= people.length; round++) {
        await expect(host.getByText(`第 ${round}／${people.length} 回合`).first()).toBeVisible()
        let judge: Page | null = null
        await expect(async () => {
          judge = null
          for (const page of people)
            if ((await page.getByTestId('role').textContent()) === '你是裁判') judge = page
          expect(judge).not.toBeNull()
        }).toPass({ timeout: 15_000 })
        const theJudge = judge as unknown as Page
        if (round === 1)
          for (const page of people) await expectAllChinese(page, 'Bluff Reader cards')
        await theJudge.getByRole('button', { name: '開始朗讀' }).click()
        for (let reader = 0; reader < people.length - 1; reader++) {
          if (round === 1 && reader === 0) await expectAllChinese(theJudge, 'Bluff Reader reading')
          await theJudge.getByRole('button', { name: '結束這一段' }).click()
        }
        await expect(theJudge.getByTestId('vote')).toBeVisible()
        for (const page of people.filter((one) => one !== theJudge)) {
          if (round === 1) await expectAllChinese(page, 'Bluff Reader stickers')
          await page.getByTestId('sticker').getByRole('button', { name: '不貼' }).click()
          await page.getByRole('button', { name: '確定不貼' }).click()
        }
        if (round === 1) await expectAllChinese(theJudge, 'Bluff Reader vote')
        await theJudge.getByTestId('vote').getByRole('button').first().click()
        await theJudge.getByRole('button', { name: /^投給 / }).click()
        await expect(host.getByTestId('round-reveal')).toBeVisible()
        if (round === 1) await expectAllChinese(host, 'Bluff Reader reveal')
        if (round < people.length) await theJudge.getByRole('button', { name: '下一回合' }).click()
      }
      const over = host.getByRole('region', { name: '結果' })
      await expect(over).toBeVisible()
      await expectAllChinese(host, 'Bluff Reader result')

      await over.getByRole('link', { name: '看重播' }).click()
      await expect(host.getByRole('heading', { name: '重播' })).toBeVisible()
      await host.getByRole('button', { name: '下一步' }).click()
      await expectAllChinese(host, 'the replay')
      for (const page of people) await page.context().close()
    })

    test('Spectrum, a round from the card to the reveal', async ({ browser }) => {
      test.setTimeout(120_000)
      browser_ = browser
      const people = await roomOf('spectrum', ['小安', '小博', '小綺', '小迪'])
      const [host] = people
      await host.goto('/games/spectrum/rules')
      await expectAllChinese(host, 'Spectrum rules page')
      await host.goBack()
      await expect(host.getByRole('heading', { name: '座位', exact: true })).toBeVisible()
      await expectAllChinese(host, 'Spectrum waiting room')
      await host.getByRole('button', { name: '開始遊戲' }).click()

      let guesser: Page | null = null
      await expect(async () => {
        guesser = null
        for (const page of people)
          if ((await page.getByRole('button', { name: /問這題$/ }).count()) > 0) guesser = page
        expect(guesser).not.toBeNull()
      }).toPass({ timeout: 15_000 })
      const theGuesser = guesser as unknown as Page
      await expectAllChinese(theGuesser, 'Spectrum topic card')
      await theGuesser
        .getByRole('button', { name: /問這題$/ })
        .first()
        .click()
      const answers = ['白飯', '熱湯', '夜市小吃']
      const answerers = people.filter((page) => page !== theGuesser)
      await expectAllChinese(answerers[0], 'Spectrum answering')
      for (const [index, page] of answerers.entries()) {
        await page.getByRole('textbox', { name: '你的回答' }).fill(answers[index])
        await page.getByRole('button', { name: '送出回答' }).click()
      }
      await expect(theGuesser.getByRole('button', { name: '確定' })).toBeVisible()
      await expectAllChinese(theGuesser, 'Spectrum guessing')
      await theGuesser.getByRole('button', { name: '確定' }).click()
      await expect(host.getByTestId('round-reveal')).toBeVisible()
      await expectAllChinese(host, 'Spectrum reveal')
      for (const page of people) await page.context().close()
    })
  })
}
