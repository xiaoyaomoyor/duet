/**
 * 当前项目 Store —— 全应用唯一的项目写入口
 *
 * 纪律（§8.3）：
 *   1. 任何修改都必须经 `dispatch(command)`；
 *      组件里直接改 `project.rows[0].label = 'x'` 会同时失去
 *      撤销重做、自动保存与可测性，属于架构性错误。
 *   2. `updatedAt` 只在这里被写入，保证"时间戳即脏标记"不会漂移。
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { applyCommandResult, createEmptyCell, createModule } from '@/services/commands'
import {
  createProject,
  duplicateProject,
  getProject,
  persistProject,
  removeProject,
  createAutosave,
  type AutosaveHandle,
  type CreateProjectOptions,
} from '@/services/projectService'
import { waitFor } from '@/lib/async'
import { deepClone } from '@/lib/clone'
import { uuid } from '@/lib/id'
import { err, ok, type Result } from '@/lib/result'
import { useSettingsStore } from './useSettingsStore'
import { useHistoryStore } from './useHistoryStore'
import { useProjectsStore } from './useProjectsStore'
import type { Command, NewModuleInput } from '@/types/commands'
import type { CellRef, ModuleInstance, ModuleRef, Project, SideId } from '@/types/project'

/** 标签页同时打开数量的软上限（超出时自动关闭最久未使用的） */
export const MAX_OPEN_TABS = 12

/** 允许通过 patchModule 修改的模块字段 */
export type ModulePatch = Partial<Pick<ModuleInstance, 'title' | 'hidden' | 'locked'>>

export const useProjectStore = defineStore('project', () => {
  const projects = useProjectsStore()
  const settings = useSettingsStore()
  const history = useHistoryStore()

  const current = ref<Project | null>(null)
  const openIds = ref<string[]>([])
  const saving = ref(false)
  const lastSavedAt = ref<number | null>(null)
  const lastError = ref<string | null>(null)
  /** 有未落盘的改动 */
  const dirty = ref(false)

  let autosave: AutosaveHandle | null = null

  // ————————————————————————————————————————————————————————
  // 派生状态
  // ————————————————————————————————————————————————————————

  const hasProject = computed(() => current.value !== null)
  const title = computed(() => current.value?.title ?? '')
  const openProjects = computed(() =>
    openIds.value
      .map((id) => projects.byId(id) ?? (current.value?.id === id ? current.value : undefined))
      .filter((project): project is Project => project !== undefined),
  )
  const isSaved = computed(() => !dirty.value && !saving.value)
  /** 撤销/重做可用性（转发历史栈，避免组件直接依赖 history store） */
  const canUndo = computed(() => hasProject.value && history.canUndo)
  const canRedo = computed(() => hasProject.value && history.canRedo)
  const undoLabel = computed(() => history.undoLabel)
  const redoLabel = computed(() => history.redoLabel)

  // ————————————————————————————————————————————————————————
  // 自动保存
  // ————————————————————————————————————————————————————————

  function ensureAutosave(): AutosaveHandle {
    if (autosave) return autosave
    autosave = createAutosave({
      // 防抖间隔每次读取设置，因此改设置立刻生效，无需重建句柄
      debounceMs: () => settings.settings.autosaveDebounceMs,
      onSaved(saved) {
        lastSavedAt.value = Date.now()
        dirty.value = false
        saving.value = false
        // 列表中的标题/更新时间需要同步刷新
        projects.upsert(saved)
      },
      onError(message) {
        lastError.value = message
        saving.value = false
      },
    })
    return autosave
  }

  function scheduleSave(): void {
    if (!current.value) return
    dirty.value = true
    saving.value = true
    const handle = ensureAutosave()
    handle.schedule(current.value)
    void settleSavingFlag(handle)
  }

  /** 等这一轮防抖落盘结束后复位"保存中"状态 */
  async function settleSavingFlag(handle: AutosaveHandle): Promise<void> {
    await waitFor(() => !handle.hasPending(), {
      timeoutMs: handle.debounceMs() + 2000,
      intervalMs: 40,
    })
    if (!handle.hasPending()) saving.value = false
  }

  /** 立即落盘（手动保存、切换项目、关闭标签页前调用） */
  async function flush(): Promise<void> {
    if (!current.value) return
    const result = await persistProject(current.value)
    if (result.ok) {
      lastSavedAt.value = Date.now()
      dirty.value = false
      projects.upsert(result.value)
    } else {
      lastError.value = result.error
    }
    saving.value = false
  }

  // ————————————————————————————————————————————————————————
  // 命令分发（唯一写入口）
  // ————————————————————————————————————————————————————————

  /**
   * 应用一条命令。
   * @param options.transient 为 true 时不写入撤销栈（如视图态切换）
   * @param options.coalesceKey 连续输入合并键
   * @param options.label 撤销菜单中显示的操作名
   */
  function dispatch(
    command: Command,
    options: { transient?: boolean; coalesceKey?: string; label?: string } = {},
  ): Result<Project, string> {
    const before = current.value
    if (!before) return err('当前没有打开的项目')

    const applied = applyCommandResult(before, command)
    if (!applied.ok) {
      lastError.value = applied.error
      return applied
    }

    const next: Project = { ...applied.value, updatedAt: Date.now() }
    current.value = next

    if (!options.transient) {
      const record: Parameters<typeof history.record>[0] = {
        before,
        after: next,
        label: options.label ?? command.t,
      }
      if (options.coalesceKey !== undefined) record.coalesceKey = options.coalesceKey
      history.record(record)
    }

    scheduleSave()
    return ok(next)
  }

  /** 便捷封装：批量应用多条命令，合并为一步撤销 */
  function dispatchMany(
    commands: readonly Command[],
    options: { coalesceKey?: string; label?: string } = {},
  ): Result<Project, string> {
    const before = current.value
    if (!before) return err('当前没有打开的项目')

    let working = before
    for (const command of commands) {
      const applied = applyCommandResult(working, command)
      if (!applied.ok) {
        lastError.value = applied.error
        return applied
      }
      working = applied.value
    }

    const next: Project = { ...working, updatedAt: Date.now() }
    current.value = next

    const record: Parameters<typeof history.record>[0] = {
      before,
      after: next,
      label: options.label ?? 'batch',
    }
    if (options.coalesceKey !== undefined) record.coalesceKey = options.coalesceKey
    history.record(record)

    scheduleSave()
    return ok(next)
  }

  function undo(): void {
    const restored = history.undo()
    if (!restored || !current.value) return
    current.value = restored
    scheduleSave()
  }

  function redo(): void {
    const restored = history.redo()
    if (!restored || !current.value) return
    current.value = restored
    scheduleSave()
  }

  // ————————————————————————————————————————————————————————
  // 项目生命周期
  // ————————————————————————————————————————————————————————

  /** 新建项目并打开 */
  async function create(options: CreateProjectOptions = {}): Promise<Result<Project, string>> {
    const project = createProject(options)
    const saved = await persistProject(project)
    if (!saved.ok) return saved

    projects.upsert(saved.value)
    await open(saved.value.id)
    return ok(saved.value)
  }

  /** 打开一个项目（已在标签页中则直接切换） */
  async function open(id: string): Promise<Result<Project, string>> {
    // 切换前把当前项目落盘，避免"改了标题就切走"导致丢失
    if (current.value && current.value.id !== id) await flush()

    const project = projects.byId(id) ?? (await loadFromDb(id))
    if (!project) return err('项目不存在，可能已被删除')

    // 记忆打开顺序：已打开则提到最前，未打开则加入并裁剪
    const rest = openIds.value.filter((item) => item !== id)
    openIds.value = [id, ...rest].slice(0, MAX_OPEN_TABS)

    current.value = deepClone(project)
    history.clear()
    dirty.value = false
    lastError.value = null

    const mode = project.ui.mode
    await settings.rememberPosition(id, mode)
    return ok(project)
  }

  async function loadFromDb(id: string): Promise<Project | undefined> {
    const project = await getProject(id)
    if (project) projects.upsert(project)
    return project
  }

  /** 关闭标签页（不删除项目） */
  async function closeTab(id: string): Promise<void> {
    openIds.value = openIds.value.filter((item) => item !== id)

    if (current.value?.id === id) {
      await flush()
      const fallbackId = openIds.value[0]
      if (fallbackId) {
        await open(fallbackId)
      } else {
        current.value = null
        history.clear()
      }
    }
  }

  /** 关闭全部标签页 */
  async function closeAllTabs(): Promise<void> {
    await flush()
    openIds.value = []
    current.value = null
    history.clear()
  }

  /** 重命名项目 */
  function rename(id: string, title: string): void {
    const next = title.trim()
    if (!next) return

    if (current.value?.id === id) {
      dispatch({ t: 'project/patch', patch: { title: next } }, { label: '重命名' })
      return
    }

    const project = projects.byId(id)
    if (!project) return
    const updated = { ...project, title: next, updatedAt: Date.now() }
    projects.upsert(updated)
    void persistProject(updated)
  }

  /** 切换置顶 */
  async function togglePinned(id: string): Promise<void> {
    if (current.value?.id === id) {
      dispatch({ t: 'project/patch', patch: { pinned: !current.value.pinned } }, { transient: true })
    }
    const project = projects.byId(id)
    if (!project) return
    const updated = { ...project, pinned: !project.pinned, updatedAt: Date.now() }
    projects.upsert(updated)
    await persistProject(updated)
  }

  /** 复制项目 */
  async function duplicate(id: string): Promise<Result<Project, string>> {
    const source = projects.byId(id)
    if (!source) return err('项目不存在')

    const copy = duplicateProject(source)
    const saved = await persistProject(copy)
    if (!saved.ok) return saved

    projects.upsert(saved.value)
    await open(saved.value.id)
    return ok(saved.value)
  }

  /**
   * 删除项目（软删除）。
   * 返回一个"撤销"闭包，供 UI 在 Toast 中提供 10 秒撤销窗口（§9.1）。
   */
  async function remove(id: string): Promise<Result<{ undo: () => Promise<void> }, string>> {
    const snapshot = projects.byId(id) ?? (await loadFromDb(id))
    if (!snapshot) return err('项目不存在')

    try {
      await removeProject(id)
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }

    await closeTab(id)
    projects.remove(id)

    return ok({
      undo: async () => {
        await persistProject(snapshot)
        projects.restore(snapshot)
      },
    })
  }

  // ————————————————————————————————————————————————————————
  // 便捷命令（供 UI 直接调用，避免组件拼命令字面量）
  // ————————————————————————————————————————————————————————

  function setSideField(sideId: SideId, patch: Record<string, unknown>): void {
    dispatch({ t: 'side/patch', sideId, patch }, { label: '修改对比方', coalesceKey: `side:${sideId}` })
  }

  function setRowLabel(rowId: string, label: string): void {
    dispatch({ t: 'row/patch', rowId, patch: { label } }, { label: '修改行标题', coalesceKey: `row-label:${rowId}` })
  }

  function addModule(ref: CellRef, input: NewModuleInput, at?: number): Result<Project, string> {
    const module = createModule(input)
    const command: Command =
      at === undefined
        ? { t: 'module/add', ref, module }
        : { t: 'module/add', ref, module, at }
    return dispatch(command, { label: '添加模块' })
  }

  function removeModule(ref: ModuleRef): Result<Project, string> {
    return dispatch({ t: 'module/remove', ref }, { label: '删除模块' })
  }

  function patchModule(ref: ModuleRef, patch: ModulePatch): Result<Project, string> {
    return dispatch(
      { t: 'module/patch', ref, patch },
      { label: '修改模块', coalesceKey: `module:${ref.moduleId}` },
    )
  }

  /** 编辑模块内容：coalesceKey 让连续输入只占用一步撤销 */
  function patchModuleData(ref: ModuleRef, patch: Record<string, unknown>): Result<Project, string> {
    return dispatch(
      { t: 'module/data', ref, patch },
      { label: '编辑内容', coalesceKey: `data:${ref.moduleId}` },
    )
  }

  function setMode(mode: 'edit' | 'present'): void {
    dispatch({ t: 'ui/patch', patch: { mode } }, { transient: true })
    if (current.value) void settings.rememberPosition(current.value.id, mode)
  }

  function addRow(): Result<Project, string> {
    const project = current.value
    if (!project) return err('当前没有打开的项目')

    const [sideA, sideB] = project.sheet.sides
    if (!sideA || !sideB) return err('对比页缺少对比方')

    return dispatch(
      {
        t: 'row/add',
        row: {
          id: uuid(),
          kind: 'paired',
          cells: { [sideA.id]: createEmptyCell(), [sideB.id]: createEmptyCell() },
          collapsed: false,
        },
      },
      { label: '添加行' },
    )
  }

  /** 应用启动时恢复上次位置（"保持位置"设置） */
  async function restoreLastPosition(): Promise<boolean> {
    if (!settings.settings.restoreLastPosition) return false
    const lastId = settings.settings.lastProjectId
    if (!lastId) return false

    const exists = projects.byId(lastId) ?? (await loadFromDb(lastId))
    if (!exists) return false

    const result = await open(lastId)
    if (!result.ok) return false

    const mode = settings.settings.lastMode
    if (mode === 'present') setMode('present')
    return true
  }

  function dispose(): void {
    autosave?.dispose()
    autosave = null
  }

  return {
    // state
    current,
    openIds,
    saving,
    lastSavedAt,
    lastError,
    dirty,
    // getters
    hasProject,
    title,
    openProjects,
    isSaved,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    // lifecycle
    create,
    open,
    closeTab,
    closeAllTabs,
    rename,
    togglePinned,
    duplicate,
    remove,
    restoreLastPosition,
    // write path
    dispatch,
    dispatchMany,
    undo,
    redo,
    // helpers
    setSideField,
    setRowLabel,
    addModule,
    removeModule,
    patchModule,
    patchModuleData,
    setMode,
    addRow,
    flush,
    dispose,
  }
})
