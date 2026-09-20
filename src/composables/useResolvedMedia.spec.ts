import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import * as resolver from '@/services/mediaResolver'
import { useResolvedMedia, waitForMediaResolutions } from './useResolvedMedia'
import type { MediaSource } from '@/types/project'

describe('warm media rendering', () => {
  it('renders cached local media immediately without a placeholder or another read', () => {
    vi.spyOn(resolver, 'peekMedia').mockReturnValue('blob:cached')
    const read = vi.spyOn(resolver, 'resolveMedia')
    const wrapper = mount(
      defineComponent({
        setup() {
          const media = useResolvedMedia({ kind: 'asset', assetId: 'cover' }, { warmStart: true })
          return () => h('span', `${media.status}:${media.src}`)
        },
      }),
    )
    expect(wrapper.text()).toBe('ready:blob:cached')
    expect(read).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('a late cold result cannot replace a newer cached selection', async () => {
    let finish!: (value: resolver.ResolvedMedia) => void
    vi.spyOn(resolver, 'peekMedia').mockImplementation((id) => (id === 'warm' ? 'blob:warm' : null))
    vi.spyOn(resolver, 'resolveMedia').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const source = ref<MediaSource>({ kind: 'asset', assetId: 'cold' })
    const wrapper = mount(
      defineComponent({
        setup() {
          const media = useResolvedMedia(source, { warmStart: true })
          return () => h('span', `${media.status}:${media.src}`)
        },
      }),
    )
    source.value = { kind: 'asset', assetId: 'warm' }
    await nextTick()
    expect(wrapper.text()).toBe('ready:blob:warm')
    finish({ status: 'ready', src: 'blob:late' })
    await waitForMediaResolutions()
    await nextTick()
    expect(wrapper.text()).toBe('ready:blob:warm')
    wrapper.unmount()
  })
})
