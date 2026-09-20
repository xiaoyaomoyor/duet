/**
 * 项目服务：工厂、持久化调度、列表查询、工程文件序列化
 *
 * 分层约定（§8.1）：
 *   ui → stores → services → db
 * 因此本文件**不包含 Pinia**，可脱离 Vue 单测。
 */

import {
  deleteProject as deleteProjectRow,
  getProject,
  listProjects,
  saveProject,
} from '@/db/projectsRepo'
import { deepClone } from '@/lib/clone'
import { waitFor } from '@/lib/async'
import { debounce, onPageExit } from '@/lib/util'
import { err, ok, type Result } from '@/lib/result'
import { validateProject } from '@/types/validate'
import { SCHEMA_VERSION } from '@/types/project'
import { APP } from '@/app.config'
import {
  createBlankProject,
  getTemplate,
  instantiateTemplate,
  type AccentPair,
} from './templateService'
import type { Project, WorkspaceKind } from '@/types/project'
import { withComparison, rekeyProject } from './comparisonContent'

export { listProjects, getProject }

// ——————————————————————————————————————————————————————————
// 工厂
// ——————————————————————————————————————————————————————————

export interface CreateProjectOptions {
  workspace?: WorkspaceKind
  name?: string
  templateId?: string
  accent?: AccentPair
  now?: number
}

/** 由模板创建一个项目（模板 id 非法时回退到空白模板） */
export function createProject(options: CreateProjectOptions = {}): Project {
  const name = options.name ?? '未命名舞台'
  const workspace = options.workspace ?? 'modern'
  const templateId =
    options.templateId && workspace === 'modern' && !options.templateId.startsWith('stage-')
      ? `stage-${options.templateId}`
      : options.templateId
  const template = templateId ? getTemplate(templateId) : undefined

  if (!template) return withComparison(createBlankProject(name, options.accent, workspace))

  const instantiateOptions = {
    name,
    workspace,
    accent: options.accent ?? template.accent,
    ...(options.now !== undefined ? { now: options.now } : {}),
  }
  if (options.now !== undefined) instantiateOptions.now = options.now
  return withComparison(instantiateTemplate(template, instantiateOptions))
}

/**
 * 复制一个项目。
 * 使用新的 id 与全新的行/模块 id，避免与源项目共享任何引用。
 */
export function duplicateProject(source: Project, now = Date.now()): Project {
  const copy = rekeyProject(source)

  copy.title = `${source.title} 副本`
  copy.createdAt = now
  copy.updatedAt = now

  // 重建所有 id，保证两份项目在数据库与撤销栈中互不干扰

  return copy
}

// ——————————————————————————————————————————————————————————
// 持久化调度（自动保存）
// ——————————————————————————————————————————————————————————

export interface AutosaveOptions {
  /**
   * 防抖间隔（ms）。
   * 可以是数字，也可以是取值函数——后者让"改设置立刻生效"无需重建句柄。
   */
  debounceMs?: number | (() => number)
  /** 保存成功后回调（用于"已保存"指示） */
  onSaved?: (project: Project) => void
  /** 保存失败回调 */
  onError?: (message: string) => void
}

export interface AutosaveHandle {
  /** 排入一次保存 */
  schedule: (project: Project) => void
  /** 立即落盘（关闭标签页、手动保存时使用） */
  flush: () => Promise<void>
  /** 丢弃待保存内容并解绑事件 */
  dispose: () => void
  /** 是否还有未落盘的改动 */
  hasPending: () => boolean
  /** 当前生效的防抖间隔 */
  debounceMs: () => number
}

/**
 * 创建自动保存句柄。
 *
 * 三道保险（§2.3 R2：永不丢数据）：
 *   1. 编辑后 debounce 落盘
 *   2. beforeunload / pagehide / visibilitychange 时 flush
 *   3. flush 失败不静默：交回 onError 由 UI 提示
 */
export function createAutosave(options: AutosaveOptions = {}): AutosaveHandle {
  let latest: Project | null = null
  let saving = false
  let dirtyWhileSaving = false

  const persist = async (): Promise<void> => {
    if (!latest) return
    if (saving) {
      dirtyWhileSaving = true
      return
    }

    const snapshot = latest
    latest = null
    saving = true

    try {
      // 落盘前自检：宁可少存一次，也不把坏数据写进数据库
      const validated = validateProject(snapshot)
      if (!validated.ok) {
        options.onError?.(validated.error)
        return
      }
      await saveProject(validated.value)
      options.onSaved?.(validated.value)
    } catch (error) {
      options.onError?.(error instanceof Error ? error.message : String(error))
    } finally {
      saving = false
      if (dirtyWhileSaving) {
        dirtyWhileSaving = false
        void persist()
      }
    }
  }

  const resolveDebounce = (): number =>
    typeof options.debounceMs === 'function' ? options.debounceMs() : (options.debounceMs ?? 300)

  const debounced = debounce(() => void persist(), resolveDebounce())

  const unbind = onPageExit(() => {
    // 页面离开时必须同步落盘：此处用 flush 而非 await（事件处理器无法 await）
    debounced.flush()
  })

  return {
    schedule(project) {
      latest = deepClone(project)
      debounced()
    },
    async flush() {
      debounced.flush()
      // flush 触发的是异步 persist，等待它完成
      // A slow IndexedDB transaction must not let a later workspace write overtake it.
      while (saving || latest !== null) await waitFor(() => !saving && latest === null)
    },
    dispose() {
      debounced.cancel()
      unbind()
    },
    hasPending: () => latest !== null || debounced.pending() || saving,
    debounceMs: resolveDebounce,
  }
}

/** 立即保存一个项目（进度保存、手动 Ctrl+S 用） */
export async function persistProject(project: Project): Promise<Result<Project, string>> {
  const validated = validateProject(project)
  if (!validated.ok) return err(validated.error)

  try {
    await saveProject(validated.value)
    return ok(validated.value)
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error))
  }
}

/** 删除项目（仓储层直通；软删除与撤销由 store 负责） */
export async function removeProject(id: string): Promise<Result<void, string>> {
  try {
    await deleteProjectRow(id)
    return ok(undefined)
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error))
  }
}

// ——————————————————————————————————————————————————————————
// 工程文件（.duet / JSON）
// ——————————————————————————————————————————————————————————

export interface ProjectFileEnvelope {
  $format: 'duet-project'
  schemaVersion: number
  exportedAt: number
  app: { name: string; version: string }
  projects: Project[]
  /** 导出时被引用的自定义工具（M2 起填充） */
  tools: unknown[]
  /** 未能内嵌的资源 id（M3 起填充） */
  integrity: { missingAssets: string[] }
}

/** 把一个或多个项目序列化为工程文件内容 */
export function serializeProjects(projects: readonly Project[]): ProjectFileEnvelope {
  return {
    $format: 'duet-project',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    app: { name: `${APP.nameZh} ${APP.nameEn}`, version: APP.version },
    projects: projects.map((project) => deepClone(project)),
    tools: [],
    integrity: { missingAssets: [] },
  }
}

/**
 * 解析工程文件内容。
 * 支持两种形态：单项目明文（旧式/手写）与信封格式。两者都会被校验。
 */
export function parseProjectFile(text: string): Result<Project[], string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return err('文件不是合法的 JSON，可能已损坏或并非对奏工程文件')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return err('工程文件内容不是对象')
  }

  const record = parsed as Record<string, unknown>

  // 形态一：信封格式 { $format, projects: [...] }
  if (record.$format === 'duet-project') {
    if (!Array.isArray(record.projects)) return err('工程文件缺少 projects 数组')
    if (record.projects.length === 0) return err('工程文件中没有任何项目')
    return validateAll(record.projects)
  }

  // 形态二：裸项目对象
  if ('sheet' in record) {
    return validateAll([record])
  }

  return err('无法识别的文件格式：既不是对奏工程文件，也不是单个项目对象')
}

/** 形态三：外部粘贴/导入的单个项目 JSON 字符串 */
export function parseSingleProject(text: string): Result<Project, string> {
  const result = parseProjectFile(text)
  if (!result.ok) return result
  const first = result.value[0]
  if (!first) return err('工程文件中没有任何项目')
  return ok(first)
}

function validateAll(items: readonly unknown[]): Result<Project[], string> {
  const projects: Project[] = []
  for (const [index, item] of items.entries()) {
    const validated = validateProject(item)
    if (!validated.ok) return err(`第 ${index + 1} 个项目校验失败：${validated.error}`)
    projects.push(validated.value)
  }
  return ok(projects)
}

/** 生成工程文件名（去掉文件系统不允许的字符） */
export function projectFileName(project: Project): string {
  const safe = project.title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'untitled'
  return `${safe}.${APP.fileExt}`
}
