import type { Project, Row, Side, LayoutConfig, ModuleInstance } from '@/types/project'
import { deepClone } from '@/lib/clone'
import {
  migrateModule,
  migrateSideAccent,
  migrateLayout,
  migrateLayoutFill,
  withoutColumnRatio,
  withTitleRow,
} from '@/db/schema'
import { withComparison } from './comparisonContent'
import { SCHEMA_VERSION } from '@/types/project'

/** Same pure migration for imports and IDB; all writes happen after validation. */
export function migrateProject(project: Project): Project {
  if (project.schemaVersion >= 9) {
    const p = deepClone(withComparison(project))
    p.schemaVersion = SCHEMA_VERSION
    p.sheet.sides.forEach((s, n) => {
      s.catalogueLabel ??= String.fromCharCode(65 + n)
    })
    if (p.sheet.sides.length > 2)
      p.sheet.layout.presentation = {
        enabled: true,
        theme: p.sheet.layout.presentation?.theme ?? 'ink',
      }
    if (project.schemaVersion < SCHEMA_VERSION && !p.migrationSnapshot)
      p.migrationSnapshot = {
        schemaVersion: project.schemaVersion,
        sheet: deepClone(project.sheet),
        ...(project.comparison ? { comparison: deepClone(project.comparison) } : {}),
      }
    return p
  }
  const p = deepClone(project)
  const snapshot = { schemaVersion: project.schemaVersion, sheet: deepClone(project.sheet) }
  if (p.schemaVersion < 3)
    for (const row of p.sheet.rows)
      for (const cell of Object.values(row.cells))
        cell.modules = cell.modules.map(
          (m) =>
            migrateModule(m as unknown as Record<string, unknown>) as unknown as ModuleInstance,
        )
  if (p.schemaVersion < 4)
    p.sheet.sides = p.sheet.sides.map(
      (s) => migrateSideAccent(s as unknown as Record<string, unknown>) as unknown as Side,
    ) as [Side, Side]
  let layout = p.sheet.layout as unknown as Record<string, unknown>
  if (p.schemaVersion < 5) layout = migrateLayout(layout)
  if (p.schemaVersion < 6) layout = migrateLayoutFill(layout)
  if (p.schemaVersion < 7) p.sheet.rows = withTitleRow(p.sheet.rows) as Row[]
  if (p.schemaVersion < 8) layout = withoutColumnRatio(layout)
  p.sheet.layout = layout as unknown as LayoutConfig
  const result = { ...withComparison(p), migrationSnapshot: snapshot }
  result.sheet.sides.forEach((s, n) => {
    s.catalogueLabel ??= String.fromCharCode(65 + n)
  })
  return result
}
