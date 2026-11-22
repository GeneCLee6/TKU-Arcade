import { afterEach, describe, expect, it } from 'vitest'
import { inertOthers } from '../../src/lib/inertOthers.ts'

// Every test undoes what it made inert: an observer left behind would mark the next test's page
const undos: Array<() => void> = []
const inert = (keep: Element[]) => {
  const undo = inertOthers(keep)
  undos.push(undo)
  return undo
}

afterEach(() => {
  for (const undo of undos.splice(0)) undo()
  document.body.replaceChildren()
})

/** <header/> <main><aside/><section id=frame><button/></section></main> <div data-inert-keep/> */
function page() {
  document.body.innerHTML = `
    <header id="top"><a href="/">Lobby</a></header>
    <main id="main">
      <aside id="chat"><button>Send</button></aside>
      <section id="frame"><button id="exit">Exit</button></section>
    </main>
    <div id="toasts" data-inert-keep=""><button>Close</button></div>
    <div id="already" inert=""></div>`
  const get = (id: string) => document.getElementById(id) as HTMLElement
  return get
}

describe('inertOthers', () => {
  it('makes everything inert but the kept element, its ancestors and what is marked to stay', () => {
    const get = page()
    inert([get('frame')])
    expect(get('top').hasAttribute('inert')).toBe(true)
    expect(get('chat').hasAttribute('inert')).toBe(true)
    expect(get('main').hasAttribute('inert')).toBe(false)
    expect(get('frame').hasAttribute('inert')).toBe(false)
    expect(get('exit').hasAttribute('inert')).toBe(false)
    expect(get('toasts').hasAttribute('inert')).toBe(false)
  })

  it('undoes what it did, and only that', () => {
    const get = page()
    const undo = inert([get('frame')])
    undo()
    expect(get('top').hasAttribute('inert')).toBe(false)
    expect(get('chat').hasAttribute('inert')).toBe(false)
    expect(get('already').hasAttribute('inert')).toBe(true)
  })

  it('makes what the page adds meanwhile inert too, until the undo', async () => {
    const get = page()
    const undo = inert([get('frame')])
    const banner = document.createElement('div')
    get('main').append(banner)
    const portal = document.createElement('div')
    document.body.append(portal)
    await Promise.resolve()
    expect(banner.hasAttribute('inert')).toBe(true)
    expect(portal.hasAttribute('inert')).toBe(true)
    undo()
    expect(banner.hasAttribute('inert')).toBe(false)
    const later = document.createElement('div')
    document.body.append(later)
    await Promise.resolve()
    expect(later.hasAttribute('inert')).toBe(false)
  })

  it('leaves alone what comes later marked to stay', async () => {
    const get = page()
    inert([get('frame')])
    const prompt = document.createElement('div')
    prompt.setAttribute('data-inert-keep', '')
    document.body.append(prompt)
    await Promise.resolve()
    expect(prompt.hasAttribute('inert')).toBe(false)
  })

  it('leaves the inside of a kept element alone', () => {
    const get = page()
    inert([get('main')])
    expect(get('chat').hasAttribute('inert')).toBe(false)
    expect(get('top').hasAttribute('inert')).toBe(true)
  })
})
