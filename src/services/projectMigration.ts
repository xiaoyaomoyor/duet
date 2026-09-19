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

/** Same pure migration for imports and IDB; all writes happen after validation. */
export function migrateProject(project: Project): Project {
  if (project.schemaVersion >= 9) return withComparison(project)
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
  return { ...withComparison(p), migrationSnapshot: snapshot }
}
