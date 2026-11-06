/**
 * jsdom has <dialog> but not its methods. Call from `beforeAll`. Real-browser behaviour (focus trap,
 * Esc) is not covered by tests that use this.
 */
export function stubDialog(): void {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
}
