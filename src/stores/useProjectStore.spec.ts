import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createProject } from '@/services/projectService'
import { useProjectStore } from './useProjectStore'
import * as repo from '@/db/projectsRepo'
import { deepClone } from '@/lib/clone'

describe('W1 workspace persistence boundary', () => {
  let store: ReturnType<typeof useProjectStore>
  beforeEach(() => {
    setActivePinia(createPinia())
    store = useProjectStore()
    store.current = createProject({ templateId: 'music', workspace: 'legacy' })
    vi.spyOn(repo, 'saveProject').mockResolvedValue(undefined)
  })
  afterEach(() => {
    store.dispose()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('waits for the latest edit before switching, persists the workspace, and supports undo/redo', async () => {
    store.dispatch({ t: 'project/patch', patch: { title: '刚输入的舞台名称' } })
    const id = store.current!.id
    const result = await store.switchWorkspace('modern')
    expect(result.ok).toBe(true)
    expect(store.current).toMatchObject({ id, title: '刚输入的舞台名称', workspace: 'modern' })
    expect(vi.mocked(repo.saveProject).mock.calls.at(-1)?.[0]).toMatchObject({
      id,
      title: '刚输入的舞台名称',
      workspace: 'modern',
    })
    store.undo()
    expect(store.current?.workspace).toBe('legacy')
    store.redo()
    expect(store.current?.workspace).toBe('modern')
    await store.flush()
  })

  it('keeps unsaved content and the old editor when the pre-switch save fails', async () => {
    vi.mocked(repo.saveProject).mockRejectedValue(new Error('quota exceeded'))
    store.dispatch({ t: 'project/patch', patch: { title: '不能丢失的输入' } })
    const before = deepClone(store.current!)
    expect(await store.switchWorkspace('modern')).toEqual({ ok: false, error: 'quota exceeded' })
    expect(store.current).toEqual(before)
    expect(store.dirty).toBe(true)
    expect(store.switchingWorkspace).toBe(false)
  })

  it('does not change workspace or create an undo entry if the workspace write fails', async () => {
    vi.mocked(repo.saveProject)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('write failed'))
    const before = deepClone(store.current!)
    expect(await store.switchWorkspace('modern')).toEqual({ ok: false, error: 'write failed' })
    expect(store.current).toEqual(before)
    expect(store.canUndo).toBe(false)
    expect(store.lastError).toBe('write failed')
  })

  it('blocks competing edits while the switch is being written', async () => {
    let release: (() => void) | undefined
    vi.mocked(repo.saveProject).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const switching = store.switchWorkspace('modern')
    await vi.waitFor(() => expect(release).toBeDefined())
    expect(store.dispatch({ t: 'project/patch', patch: { title: 'competing edit' } }).ok).toBe(
      false,
    )
    expect((await store.open('other')).ok).toBe(false)
    release!()
    expect((await switching).ok).toBe(true)
  })

  it('does not overtake an autosave taking longer than the old polling timeout', async () => {
    vi.useFakeTimers()
    let release: (() => void) | undefined
    vi.mocked(repo.saveProject).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    store.dispatch({ t: 'project/patch', patch: { title: 'slow write' } })
    const switching = store.switchWorkspace('modern')
    await vi.advanceTimersByTimeAsync(3500)
    expect(repo.saveProject).toHaveBeenCalledTimes(1)
    expect(store.current?.workspace).toBe('legacy')
    release!()
    await vi.advanceTimersByTimeAsync(50)
    expect((await switching).ok).toBe(true)
    expect(vi.mocked(repo.saveProject).mock.calls.at(-1)?.[0]).toMatchObject({
      title: 'slow write',
      workspace: 'modern',
    })
  })
})
