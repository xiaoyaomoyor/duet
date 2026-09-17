import { afterEach, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { i18n } from '@/i18n'
import AppPrompt from './AppPrompt.vue'

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

it('一次 Enter 只提交一次链接，输入法确认不提交', async () => {
  wrapper = mount(AppPrompt, {
    attachTo: document.body,
    props: { open: true, title: 'Import', label: 'URL' },
    global: { plugins: [i18n] },
  })
  const input = document.querySelector<HTMLInputElement>('.prompt__input')!
  input.value = 'https://example.com/audio.wav'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
  )
  expect(wrapper.emitted('confirm')).toBeUndefined()
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  expect(wrapper.emitted('confirm')).toEqual([['https://example.com/audio.wav', false]])
})
