import { expect, test, type Page } from '@playwright/test'

// 2026-11-23 (docs/ARCHITECTURE.md §4.97; #177's known limit: "the name plate covers the winner's
// nose in the close-up"): the podium's ceremony on its own, at a wide screen, a phone on its side and
// one held upright. Once the camera has closed in on the winner, the winner's plate is clear of the
// winner's kart and driver as drawn (the stage's own projection of them, podiumStage.ts), and the
// other two plates have gone. Mounted straight from the dev server's modules, so it needs `npm run
// dev` (or E2E_PORT), not a preview.
test.use({
  launchOptions: {
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  },
  locale: 'en-US',
})
test.setTimeout(120_000)

const ENTRIES = [
  { seat: 0, place: 1, name: 'Ann', kart: 'kite', driver: 'spade', outfit: 'street', line: '1:02.345', you: true },
  { seat: 1, place: 2, name: 'Bo', kart: 'comet', driver: 'heart', line: '1:03.100', you: false },
  { seat: 2, place: 3, name: 'Cy', kart: 'swift', driver: 'club', outfit: 'campus', line: '1:04.900', you: false },
]

async function mountPodium(page: Page) {
  await page.goto('/')
  await page.evaluate(async (entries) => {
    // The same React and React DOM the site itself uses (Vite's optimised copies, as main.tsx imports them)
    const main = await (await fetch('/src/main.tsx')).text()
    const dep = (name: string) => new RegExp(`/node_modules/\\.vite/deps/${name}\\.js\\?v=[0-9a-z]+`).exec(main)![0]
    // (CommonJS packages: what they export is their default)
    const react = (await import(/* @vite-ignore */ dep('react'))).default
    const dom = (await import(/* @vite-ignore */ dep('react-dom_client'))).default
    const ceremony = '/src/kart/ceremony/PodiumCeremony.tsx'
    const { default: PodiumCeremony } = await import(/* @vite-ignore */ ceremony)
    document.body.innerHTML = '<div id="podium-test"></div>'
    dom.createRoot(document.getElementById('podium-test')).render(
      react.createElement(PodiumCeremony, { entries, onDone: () => undefined }),
    )
  }, ENTRIES)
}

for (const screen of [
  { name: 'wide', width: 1280, height: 720 },
  { name: 'phone on its side', width: 844, height: 390 },
  { name: 'phone held upright', width: 390, height: 844 },
]) {
  test(`the winner's plate stays off the kart in the close-up: ${screen.name}`, async ({ page }, info) => {
    await page.setViewportSize({ width: screen.width, height: screen.height })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await mountPodium(page)
    const plates = page.getByTestId('kart-podium-plates')
    await expect(plates).toBeVisible()
    // Wide first: all three plates
    await expect(page.getByTestId('kart-podium-2')).toBeVisible({ timeout: 5_000 })
    // The close-up (WINNER_SHOW_AT 3.8 s, then 0.8 s in)
    await expect(plates).toHaveAttribute('data-close', 'true', { timeout: 8_000 })
    await page.waitForTimeout(1_300)
    await expect(page.getByTestId('kart-podium-2')).toBeHidden()
    await expect(page.getByTestId('kart-podium-3')).toBeHidden()
    const plate = await page.getByTestId('kart-podium-1').boundingBox()
    const kart = await page.evaluate(
      () => (window as unknown as { __kartPodium?: { winnerBox(): unknown } }).__kartPodium?.winnerBox() ?? null,
    ) as { left: number; top: number; right: number; bottom: number } | null
    await info.attach(`podium-closeup-${screen.width}x${screen.height}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
    expect(plate).not.toBeNull()
    expect(kart).not.toBeNull()
    const apart =
      plate!.x + plate!.width <= kart!.left ||
      plate!.x >= kart!.right ||
      plate!.y + plate!.height <= kart!.top ||
      plate!.y >= kart!.bottom
    expect(apart, JSON.stringify({ plate, kart })).toBe(true)
    expect(errors).toEqual([])
  })
}
