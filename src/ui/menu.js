/**
 * The Windows menu bar: Game and Help, with drop-downs that open on click and behave for the
 * keyboard as well as the mouse.
 */

/**
 * @typedef {object} MenuItem
 * @property {string} [label]
 * @property {string} [shortcut] accelerator text shown on the right
 * @property {() => void} [action]
 * @property {boolean} [checked] renders a bullet, for the radio-like options
 * @property {boolean} [disabled]
 * @property {boolean} [separator]
 */

/**
 * @typedef {object} Menu
 * @property {string} id
 * @property {string} label
 * @property {() => MenuItem[]} items resolved when the menu opens, so state is always current
 */

/**
 * @param {HTMLElement} bar
 * @param {Menu[]} menus
 */
export function createMenuBar(bar, menus) {
  /** @type {HTMLElement|null} */
  let openList = null
  /** @type {HTMLButtonElement|null} */
  let openButton = null

  /** @type {Map<string, HTMLButtonElement>} */
  const buttons = new Map()

  function close() {
    openList?.remove()
    openButton?.setAttribute('aria-expanded', 'false')
    openList = null
    openButton = null
  }

  /**
   * @param {Menu} menu
   * @param {HTMLButtonElement} button
   */
  function open(menu, button) {
    close()

    const list = document.createElement('div')
    list.className = 'menu'
    list.setAttribute('role', 'menu')
    list.setAttribute('aria-label', menu.label)

    for (const item of menu.items()) {
      if (item.separator) {
        const rule = document.createElement('div')
        rule.className = 'menu__separator'
        rule.setAttribute('role', 'separator')
        list.append(rule)
        continue
      }

      const entry = document.createElement('button')
      entry.type = 'button'
      entry.className = 'menu__item'
      entry.setAttribute('role', item.checked === undefined ? 'menuitem' : 'menuitemradio')
      if (item.checked !== undefined) entry.setAttribute('aria-checked', String(item.checked))
      entry.disabled = Boolean(item.disabled)

      const label = document.createElement('span')
      label.textContent = item.label ?? ''
      entry.append(label)

      if (item.shortcut) {
        const shortcut = document.createElement('span')
        shortcut.className = 'menu__shortcut'
        shortcut.textContent = item.shortcut
        entry.append(shortcut)
      }

      entry.addEventListener('click', () => {
        close()
        item.action?.()
      })
      list.append(entry)
    }

    const bounds = button.getBoundingClientRect()
    list.style.left = `${bounds.left}px`
    list.style.top = `${bounds.bottom}px`
    document.body.append(list)

    // Keep the menu on screen when it opens near the right-hand edge.
    const overflow = list.getBoundingClientRect().right - window.innerWidth + 4
    if (overflow > 0) list.style.left = `${Math.max(2, bounds.left - overflow)}px`

    button.setAttribute('aria-expanded', 'true')
    openList = list
    openButton = button
  }

  for (const menu of menus) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'menubar__button'
    button.textContent = menu.label
    button.dataset.menu = menu.id
    button.setAttribute('role', 'menuitem')
    button.setAttribute('aria-haspopup', 'true')
    button.setAttribute('aria-expanded', 'false')

    button.addEventListener('click', (event) => {
      event.stopPropagation()
      if (openButton === button) close()
      else open(menu, button)
    })
    // Once one menu is open, sliding across the bar switches between them, as in Windows.
    button.addEventListener('pointerenter', () => {
      if (openButton && openButton !== button) open(menu, button)
    })

    buttons.set(menu.id, button)
    bar.append(button)
  }

  document.addEventListener('pointerdown', (event) => {
    if (!openList) return
    const target = /** @type {Node} */ (event.target)
    if (!openList.contains(target) && !bar.contains(target)) close()
  })

  document.addEventListener('keydown', (event) => {
    if (!openList) return

    if (event.key === 'Escape') {
      openButton?.focus()
      close()
      event.preventDefault()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const entries = [...openList.querySelectorAll('button:not(:disabled)')]
      if (entries.length === 0) return
      const current = entries.indexOf(/** @type {Element} */ (document.activeElement))
      const step = event.key === 'ArrowDown' ? 1 : -1
      const next = (current + step + entries.length + (current === -1 ? 1 : 0)) % entries.length
      const target = /** @type {HTMLElement} */ (entries[next])
      target.focus()
      event.preventDefault()
    }
  })

  return { close }
}
