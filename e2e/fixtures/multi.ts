import { studioFixture } from './studio'
import type { ComparisonCase } from '../../src/types/presentation'

export function multiFixture(count = 6) {
  const p = studioFixture()
  p.id = 'r4-fixture'
  p.title = '同一束光，六种回声'
  p.schemaVersion = 9
  const names = ['Suno', 'Udio', 'Mureka', 'ACE Studio', 'Stable Audio', 'Riffusion']
  while (p.sheet.sides.length < count) {
    const n = p.sheet.sides.length,
      id = String.fromCharCode(97 + n)
    p.sheet.sides.push({
      ...p.sheet.sides[0],
      id,
      toolRef: { kind: 'inline', name: names[n]! },
      modelVersion: `试验 ${n + 1}`,
      note: '',
    })
    for (const row of p.sheet.rows)
      if (row.kind === 'paired') {
        const cell = structuredClone(row.cells.a!)
        for (const m of cell.modules) m.id += `-${id}`
        row.cells[id] = cell
      }
  }
  const c: ComparisonCase = {
    id: 'case-six',
    title: '雨后街角',
    conditions: '同一提示词 · 同等生成次数 · 无后期处理',
    sections: p.sheet.rows.map(({ cells, ...r }) => ({
      ...r,
      ...(r.kind === 'full' ? { sharedCells: structuredClone(cells) } : {}),
    })),
    entries: {},
  }
  for (const [n, side] of p.sheet.sides.entries()) {
    const sample = {
      id: `${side.id}-one`,
      title: `${['琥珀雨后', '潮汐留白', '穿过长街', '微光之间', '远处的回声', '最后一盏灯'][n]} / 初版`,
      conditions: '',
      hidden: false,
      contentBySection: Object.fromEntries(
        p.sheet.rows
          .filter((r) => r.kind === 'paired')
          .map((r) => [r.id, structuredClone(r.cells[side.id]!)]),
      ),
    }
    const audio = sample.contentBySection.listen!.modules[0]!
    audio.data = { ...(audio.data as object), name: `Take ${side.id.toUpperCase()}.wav` }
    const alt = structuredClone(sample)
    alt.id = `${side.id}-two`
    alt.title = `作品 ${side.id.toUpperCase()} / 第二次生成`
    for (const cell of Object.values(alt.contentBySection))
      for (const m of cell.modules) m.id += '-two'
    alt.contentBySection.listen!.modules[0]!.data = {
      ...(audio.data as object),
      name: `Alternate ${side.id.toUpperCase()}.wav`,
    }
    const metric = alt.contentBySection.metrics!.modules[0]!
    metric.data = {
      rows: [
        { key: '生成耗时', value: `${n + 20} s` },
        { key: '另次观察', value: `证据 ${side.id.toUpperCase()}` },
      ],
    }
    c.entries[side.id] = { defaultSampleId: sample.id, samples: [sample, alt] }
  }
  p.comparison = {
    cases: [c],
    combinations: [],
    scenes: ['listen', 'notes', 'metrics'].map((id) => ({
      id: `scene-${id}`,
      caseId: c.id,
      sectionId: id,
      title:
        id === 'listen'
          ? '六种回声，逐一聆听'
          : id === 'notes'
            ? '不同的表达方式'
            : '把差异放在一起',
      hidden: false,
      samples: {},
      steps: [],
    })),
  }
  return p
}
