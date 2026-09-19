/**
 * 项目数据校验（纯函数）
 *
 * 用途：
 *   1. 导入 .duet / JSON 工程文件时拒绝结构损坏的数据（§6.4）
 *   2. 持久化前做一次自检，避免把坏数据写进数据库
 *
 * 取舍：**不做逐字段的深度校验**（那是 schema 库的活），
 * 只保证"走到渲染层不会崩"这一底线，并给出可读的错误信息。
 */

import { SCHEMA_VERSION, type Project, type Sheet, type Side, type Row, type Cell } from './project'
import type { Result } from '@/lib/result'
import { ok, err } from '@/lib/result'
import { migrateProject } from '@/services/projectMigration'
import { validateComparison } from './validateComparison'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** 校验一个 Side */
export function validateSide(value: unknown, path: string): Result<Side, string> {
  if (!isPlainObject(value)) return err(`${path}：不是对象`)
  if (!isNonEmptyString(value.id)) return err(`${path}.id：缺失或非法`)
  if (!isNonEmptyString(value.accent)) return err(`${path}.accent：缺失或非法`)

  const toolRef = value.toolRef
  if (!isPlainObject(toolRef)) return err(`${path}.toolRef：缺失或非法`)
  if (toolRef.kind !== 'builtin' && toolRef.kind !== 'custom' && toolRef.kind !== 'inline') {
    return err(`${path}.toolRef.kind：非法取值 ${String(toolRef.kind)}`)
  }
  if (toolRef.kind === 'inline' && !isNonEmptyString(toolRef.name)) {
    return err(`${path}.toolRef.name：临时工具必须有名称`)
  }
  if (toolRef.kind !== 'inline' && !isNonEmptyString(toolRef.toolId)) {
    return err(`${path}.toolRef.toolId：缺失或非法`)
  }

  // —— v2 可选字段 ——
  if (value.iconAssetId !== undefined && !isNonEmptyString(value.iconAssetId)) {
    return err(`${path}.iconAssetId：存在时必须是资源 id`)
  }
  for (const key of ['showIcon', 'showName', 'showVersion', 'showNote'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') {
      return err(`${path}.${key}：存在时必须是布尔值`)
    }
  }

  return ok(value as unknown as Side)
}

/** 校验一个 Cell */
export function validateCell(value: unknown, path: string): Result<Cell, string> {
  if (!isPlainObject(value)) return err(`${path}：不是对象`)
  if (!Array.isArray(value.modules)) return err(`${path}.modules：必须是数组`)
  if (typeof value.hidden !== 'boolean') return err(`${path}.hidden：必须是布尔值`)

  for (const [index, module] of value.modules.entries()) {
    const result = validateModuleInstance(module, `${path}.modules[${index}]`)
    if (!result.ok) return result
  }

  return ok(value as unknown as Cell)
}

/** 校验一个模块实例 */
export function validateModuleInstance(value: unknown, path: string): Result<unknown, string> {
  if (!isPlainObject(value)) return err(`${path}：不是对象`)
  if (!isNonEmptyString(value.id)) return err(`${path}.id：缺失或非法`)
  if (!isNonEmptyString(value.type)) return err(`${path}.type：缺失或非法`)
  if (typeof value.title !== 'string') return err(`${path}.title：必须是字符串`)
  if (typeof value.hidden !== 'boolean') return err(`${path}.hidden：必须是布尔值`)
  if (!isPlainObject(value.props)) return err(`${path}.props：必须是对象`)
  if (value.data === undefined) return err(`${path}.data：缺失`)
  return ok(value)
}

/** 校验一行 */
export function validateRow(value: unknown, path: string): Result<Row, string> {
  if (!isPlainObject(value)) return err(`${path}：不是对象`)
  if (!isNonEmptyString(value.id)) return err(`${path}.id：缺失或非法`)
  if (value.kind !== 'paired' && value.kind !== 'full') {
    return err(`${path}.kind：只能是 paired 或 full`)
  }
  if (!isPlainObject(value.cells)) return err(`${path}.cells：必须是对象`)

  // v2：行高是可选的，但一旦存在就必须是"能当高度用"的数
  // （0、负数、NaN 都会让画布塌掉或撑爆，必须在这里拦下）
  if (value.height !== undefined) {
    if (typeof value.height !== 'number' || !Number.isFinite(value.height) || value.height <= 0) {
      return err(`${path}.height：存在时必须是正数`)
    }
  }

  for (const [sideId, cell] of Object.entries(value.cells)) {
    const result = validateCell(cell, `${path}.cells["${sideId}"]`)
    if (!result.ok) return result
  }

  return ok(value as unknown as Row)
}

/** 校验对比页 */
export function validateSheet(value: unknown, path = 'sheet'): Result<Sheet, string> {
  if (!isPlainObject(value)) return err(`${path}：不是对象`)
  if (!isNonEmptyString(value.id)) return err(`${path}.id：缺失或非法`)
  if (!Array.isArray(value.sides)) return err(`${path}.sides：必须是数组`)
  if (value.sides.length < 2) return err(`${path}.sides：至少需要两侧`)

  for (const [index, side] of value.sides.entries()) {
    const result = validateSide(side, `${path}.sides[${index}]`)
    if (!result.ok) return result
  }

  if (!Array.isArray(value.rows)) return err(`${path}.rows：必须是数组`)
  for (const [index, row] of value.rows.entries()) {
    const result = validateRow(row, `${path}.rows[${index}]`)
    if (!result.ok) return result
  }

  if (!isPlainObject(value.layout)) return err(`${path}.layout：缺失或非法`)
  const presentation = value.layout.presentation
  if (
    presentation !== undefined &&
    (!isPlainObject(presentation) ||
      typeof presentation.enabled !== 'boolean' ||
      !['ink', 'paper'].includes(String(presentation.theme)))
  ) {
    return err(`${path}.layout.presentation：非法的舞台外观`)
  }

  return ok(value as unknown as Sheet)
}

/**
 * 校验一个项目对象。
 * `allowNewerSchema` 为 false 时，遇到更高版本直接拒绝（§6.3 规则）。
 */
export function validateProject(value: unknown): Result<Project, string> {
  if (!isPlainObject(value)) return err('工程文件：根节点不是对象')

  if (value.schemaVersion === undefined) return err('工程文件：缺少 schemaVersion')
  if (typeof value.schemaVersion !== 'number') return err('工程文件：schemaVersion 必须是数字')
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1)
    return err('工程文件：schemaVersion 必须是正整数')

  if (value.schemaVersion > SCHEMA_VERSION) {
    return err(
      `工程文件版本（v${value.schemaVersion}）高于当前应用支持的版本（v${SCHEMA_VERSION}），请先升级应用`,
    )
  }

  if (!isNonEmptyString(value.id)) return err('项目：缺少 id')
  if (typeof value.title !== 'string') return err('项目：title 必须是字符串')
  if (!isPlainObject(value.ui)) return err('项目：缺少 ui 状态')

  const sheetResult = validateSheet(value.sheet)
  if (!sheetResult.ok) return sheetResult
  if (value.comparison !== undefined) {
    const content = validateComparison(value.comparison, value as unknown as Project)
    if (!content.ok) return content
  }
  if (value.migrationSnapshot !== undefined) {
    const snapshot = value.migrationSnapshot
    if (
      !isPlainObject(snapshot) ||
      typeof snapshot.schemaVersion !== 'number' ||
      !Number.isInteger(snapshot.schemaVersion) ||
      snapshot.schemaVersion < 1 ||
      snapshot.schemaVersion > 8 ||
      !validateSheet(snapshot.sheet).ok
    )
      return err('升级前快照损坏，无法保证恢复，请重新导入原始工程')
  }

  // 补齐可选字段，保证下游不必到处判空
  const project = migrateProject(value as unknown as Project)
  const comparison = validateComparison(project.comparison, project)
  if (!comparison.ok) return comparison
  return ok({
    ...project,
    tags: Array.isArray(project.tags) ? project.tags : [],
    pinned: project.pinned === true,
    createdAt: typeof project.createdAt === 'number' ? project.createdAt : Date.now(),
    updatedAt: typeof project.updatedAt === 'number' ? project.updatedAt : Date.now(),
  })
}

/**
 * 收集项目引用到的全部 assetId（含两侧图标与工具引用）。
 * 用于"清理未引用媒体"（§6.2 约束 3）。
 */
export function collectAssetIds(project: Project): Set<string> {
  const ids = new Set<string>()

  const visitUnknown = (value: unknown): void => {
    if (typeof value === 'string') return
    if (Array.isArray(value)) {
      for (const item of value) visitUnknown(item)
      return
    }
    if (!isPlainObject(value)) return
    for (const [key, item] of Object.entries(value)) {
      // 约定：任何以 AssetId 结尾的字段都指向资源。
      // ⚠️ 必须带 i 标志：字段名实际是 `assetId`（小写 a 开头），
      // 早期用 /AssetId$/ 会因为大小写敏感而**静默漏掉全部资源引用**。
      if (/assetId$/i.test(key) && typeof item === 'string' && item) {
        ids.add(item)
        continue
      }
      // 波形等大数组无需遍历
      if (key === 'waveform') continue
      visitUnknown(item)
    }
  }

  visitUnknown(project)
  for (const side of project.sheet.sides) {
    if (side.toolRef.kind === 'inline' && side.toolRef.iconAssetId) {
      ids.add(side.toolRef.iconAssetId)
    }
  }

  for (const row of project.sheet.rows) {
    for (const cell of Object.values(row.cells)) {
      for (const module of cell.modules) {
        visitUnknown(module.data)
        visitUnknown(module.props)
      }
    }
  }

  return ids
}
