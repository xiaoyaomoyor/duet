<script setup lang="ts">
/**
 * 代码对比渲染器
 *
 * 并排两栏，差异行按 kind 着色：
 *   equal  无底色
 *   change 两侧都高亮（修改）
 *   add    仅右侧高亮（新增）
 *   remove 仅左侧高亮（删除）
 *
 * 行号占位必须保留：缺失的一侧用一条空白行占位，
 * 左右两侧的行号才能一直对齐——这是并排 diff 可读性的全部前提。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { diffLines, splitLines } from '@/lib/textDiff'
import type { ModuleRendererProps } from '../types'
import type { DiffData, DiffProps } from './index'

const props = defineProps<ModuleRendererProps>()

const { t } = useI18n()

const data = computed(() => props.module.data as DiffData)
const options = computed(() => (props.module.props ?? {}) as Partial<DiffProps>)

/** 行尾空白在对比里几乎总是噪声，默认忽略 */
function normalize(text: string): string {
  if (options.value.ignoreTrailingWhitespace === false) return text
  return splitLines(text)
    .map((line) => line.trimEnd())
    .join('\n')
}

const result = computed(() => diffLines(normalize(data.value.left ?? ''), normalize(data.value.right ?? '')))

const identical = computed(
  () => result.value.stats.added === 0 && result.value.stats.removed === 0,
)

/** 两侧都没内容时不渲染任何东西（虽然 isEmpty 已经拦过一道） */
const blank = computed(
  () => splitLines(data.value.left ?? '').length === 0 && splitLines(data.value.right ?? '').length === 0,
)

/** 完全相同时：按选项决定"显示一句提示"还是"什么都不显示" */
const showEqualNotice = computed(
  () => identical.value && !blank.value && options.value.showWhenEqual !== false,
)

const summary = computed(() => {
  const { added, removed } = result.value.stats
  if (added === 0 && removed === 0) return ''
  const parts: string[] = []
  if (added > 0) parts.push(`+${added}`)
  if (removed > 0) parts.push(`−${removed}`)
  return parts.join(' ')
})

/**
 * 左右两栏的高亮规则不同，必须分开算：
 *   左侧高亮 change / remove（左边"有内容且被改或被删"）
 *   右侧高亮 change / add
 * 合成一张表会让 remove 行把右侧也染红（右侧明明是空的）。
 */
function leftClass(kind: string): string {
  if (kind === 'change') return 'diff-view__cell--change'
  if (kind === 'remove') return 'diff-view__cell--remove'
  return ''
}

function rightClass(kind: string): string {
  if (kind === 'change') return 'diff-view__cell--change'
  if (kind === 'add') return 'diff-view__cell--add'
  return ''
}
</script>

<template>
  <div v-if="!blank" class="diff-view">
    <div class="diff-view__head">
      <span class="diff-view__title">{{ data.leftLabel || t('diff.leftFallback') }}</span>
      <span v-if="summary" class="diff-view__stat" aria-live="polite">{{ summary }}</span>
      <span class="diff-view__title diff-view__title--right">{{
        data.rightLabel || t('diff.rightFallback')
      }}</span>
    </div>

    <p v-if="showEqualNotice" class="diff-view__equal">{{ t('diff.identical') }}</p>

    <div v-else class="diff-view__body" role="table" :aria-label="t('diff.tableLabel')">
      <div
        v-for="(row, index) in result.rows"
        :key="index"
        class="diff-view__row"
        :class="`diff-view__row--${row.kind}`"
        role="row"
      >
        <span class="diff-view__no" aria-hidden="true">{{ row.leftNo ?? '' }}</span>
        <span class="diff-view__cell" :class="leftClass(row.kind)" role="cell">{{
          row.left ?? ''
        }}</span>
        <span class="diff-view__no" aria-hidden="true">{{ row.rightNo ?? '' }}</span>
        <span class="diff-view__cell" :class="rightClass(row.kind)" role="cell">{{
          row.right ?? ''
        }}</span>
      </div>
    </div>

    <p v-if="result.truncated" class="diff-view__truncated">{{ t('diff.truncated') }}</p>
  </div>
</template>

<style scoped>
.diff-view {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
}

.diff-view__head {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--sp-2);
  align-items: center;
  padding-bottom: var(--sp-1);
  font-family: var(--font-sans);
  border-bottom: 1px solid var(--border-subtle);
}

.diff-view__title {
  overflow: hidden;
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-view__title--right {
  text-align: right;
}

.diff-view__stat {
  flex: none;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.diff-view__equal {
  padding: var(--sp-3);
  font-family: var(--font-sans);
  color: var(--text-muted);
  text-align: center;
}

.diff-view__body {
  max-height: 420px;
  overflow: auto;
}

.diff-view__row {
  display: grid;
  grid-template-columns: 2.5em 1fr 2.5em 1fr;
  gap: var(--sp-2);
  line-height: var(--lh-normal);
}

.diff-view__no {
  color: var(--text-disabled);
  text-align: right;
  user-select: none;
}

.diff-view__cell {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.diff-view__cell--change {
  background: var(--warning-soft);
}

.diff-view__cell--add {
  background: var(--success-soft);
}

.diff-view__cell--remove {
  background: var(--danger-soft);
}

.diff-view__truncated {
  font-family: var(--font-sans);
  color: var(--warning);
}
</style>
