import { onBeforeUnmount, reactive, ref } from 'vue'

/** 样板的稳定试听宿主：一次一个音源；切场景/离开页面暂停，R2 可复用。 */
export function useStagePlayback() {
  const elements = new Map<string, HTMLAudioElement>()
  const state = reactive<
    Record<string, { playing: boolean; current: number; duration: number; error: boolean }>
  >({})
  const activeId = ref<string | null>(null)
  let request = 0

  function pauseAll(): void {
    request++
    for (const audio of elements.values()) audio.pause()
  }
  function register(id: string, element: HTMLAudioElement | null): void {
    const previous = elements.get(id)
    if (previous && previous !== element) previous.pause()
    if (element) {
      elements.set(id, element)
      state[id] ??= { playing: false, current: 0, duration: 0, error: false }
    } else {
      request++
      elements.delete(id)
      delete state[id]
      if (activeId.value === id) activeId.value = null
    }
  }
  function update(id: string): void {
    const audio = elements.get(id)
    if (!audio) return
    state[id] = {
      playing: !audio.paused && !audio.ended,
      current: audio.currentTime,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      error: !!audio.error,
    }
  }
  async function toggle(id: string): Promise<void> {
    const audio = elements.get(id)
    if (!audio) return
    const wasPlaying = !audio.paused
    pauseAll()
    activeId.value = id
    if (wasPlaying) return
    const token = request
    try {
      await audio.play()
      if (request !== token) audio.pause()
      else update(id)
    } catch {
      if (request === token && state[id]) state[id]!.error = true
    }
  }
  function seek(id: string, seconds: number): void {
    const audio = elements.get(id)
    if (!audio || !Number.isFinite(audio.duration)) return
    audio.currentTime = Math.max(0, Math.min(audio.duration, seconds))
    update(id)
  }
  onBeforeUnmount(() => {
    pauseAll()
    elements.clear()
  })
  return { state, activeId, register, update, toggle, pauseAll, seek }
}
