/**
 * Modal windows, dressed as Windows dialogs.
 *
 * Each one is built, shown, awaited and then thrown away, so nothing has to be kept in sync
 * with the game state -- the dialog reads it once on open and reports the answer back.
 */

/** @typedef {{ value: string, label: string, primary?: boolean }} DialogButton */

/**
 * @param {object} options
 * @param {string} options.title
 * @param {HTMLElement|string} options.body
 * @param {DialogButton[]} [options.buttons]
 * @param {boolean} [options.dismissable] whether Escape and the close box work
 * @returns {Promise<string>} the value of the button used, or `cancel` if dismissed
 */
export function showDialog({ title, body, buttons = [{ value: 'ok', label: 'OK' }], dismissable = true }) {
  const dialog = document.createElement('dialog')
  dialog.className = 'dialog'

  const titlebar = document.createElement('div')
  titlebar.className = 'titlebar'
  titlebar.innerHTML = '<span class="titlebar__text"></span>'
  const titleText = /** @type {HTMLElement} */ (titlebar.querySelector('.titlebar__text'))
  titleText.textContent = title

  if (dismissable) {
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'titlebar__button titlebar__button--close'
    close.setAttribute('aria-label', 'Close')
    close.addEventListener('click', () => dialog.close('cancel'))
    const group = document.createElement('span')
    group.className = 'titlebar__buttons'
    group.append(close)
    titlebar.append(group)
  }

  const content = document.createElement('div')
  content.className = 'dialog__body'
  if (typeof body === 'string') content.textContent = body
  else content.append(body)

  const footer = document.createElement('div')
  footer.className = 'dialog__footer'
  for (const button of buttons) {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'button'
    element.textContent = button.label
    element.value = button.value
    element.addEventListener('click', () => dialog.close(button.value))
    footer.append(element)
  }

  dialog.append(titlebar, content, footer)
  dialog.addEventListener('cancel', (event) => {
    if (!dismissable) event.preventDefault()
  })

  const host = /** @type {HTMLElement} */ (document.getElementById('dialogs'))
  host.append(dialog)
  dialog.showModal()

  const primary = buttons.find((button) => button.primary) ?? buttons[0]
  const focusTarget = /** @type {HTMLElement|null} */ (
    content.querySelector('input, select, button') ??
      footer.querySelector(`[value="${primary?.value}"]`)
  )
  focusTarget?.focus()

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const result = dialog.returnValue || 'cancel'
      dialog.remove()
      resolve(result)
    })
  })
}

/**
 * A plain message box.
 * @param {string} title
 * @param {string} message
 */
export function showMessage(title, message) {
  return showDialog({ title, body: message })
}

/**
 * @param {string} title
 * @param {string} message
 * @param {string} [confirmLabel]
 * @returns {Promise<boolean>}
 */
export async function confirmDialog(title, message, confirmLabel = 'OK') {
  const answer = await showDialog({
    title,
    body: message,
    buttons: [
      { value: 'ok', label: confirmLabel, primary: true },
      { value: 'cancel', label: 'Cancel' },
    ],
  })
  return answer === 'ok'
}

/**
 * Builds a labelled control row.
 * @param {string} type `radio` or `checkbox`
 * @param {string} name
 * @param {string} label
 * @param {boolean} checked
 * @param {string} [value]
 */
export function field(type, name, label, checked, value = '') {
  const row = document.createElement('div')
  row.className = 'field'

  const input = document.createElement('input')
  input.type = type
  input.name = name
  input.checked = checked
  input.value = value
  input.id = `field-${name}-${value || 'on'}`

  const text = document.createElement('label')
  text.htmlFor = input.id
  text.textContent = label

  row.append(input, text)
  return row
}

/**
 * @param {string} legend
 * @param {HTMLElement[]} rows
 */
export function fieldset(legend, rows) {
  const group = document.createElement('fieldset')
  group.className = 'fieldset'
  const caption = document.createElement('legend')
  caption.textContent = legend
  group.append(caption, ...rows)
  return group
}
