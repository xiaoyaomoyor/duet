<script setup lang="ts">
/**
 * 模块选择器
 *
 * 结构：搜索框 → 按分类分组 → 点击即添加。
 * 只展示**已在注册表登记**的模块；meta.ts 中规划中的模块以"规划中"标注并禁用，
 * 避免给出点了没反应的选项（诚实边界）。
 */
import { computed, ref, watch } from 'vue'
import { useModalFocus } from '@/composables/useModalFocus'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { groupModuleMeta, MODULE_META, moduleMaturity, type ModuleCategory } from '@/modules/meta'
import { getModule, registeredTypes } from '@/modules/registry'
import { normalizeForSearch } from '@/lib/text'
import { t as translate } from '@/i18n/helper'

const props = defineProps<{
  open: boolean
  theme?: 'ink' | 'paper'
  /**
   * 放置位置，决定哪些模块可选：
   *   'side'   —— 放进左右某一侧（默认）：排除纯通用模块（如音频控制台，
   *               它要同时操纵两侧，放进一侧没有意义）
   *   'common' —— 放进通用行（横跨两栏）：只保留通用模块
   */
  scope?: 'side' | 'common'
}>()

const emit = defineEmits<{
  pick: [type: string]
  close: []
}>()

const { t } = useI18n()

const query = ref('')
const dialogRoot = ref<HTMLElement | null>(null)
useModalFocus(dialogRoot, () => emit('close'))

watch(
  () => props.open,
  (open) => {
    if (open) query.value = ''
  },
)

const available = computed(() => new Set(registeredTypes()))

const groups = computed(() => {
  const q = normalizeForSearch(query.value)
  const wanted = props.scope ?? 'side'

  /**
   * 按放置位置过滤。
   *
   * scope 取自**模块实现**（getModule(type).scope）而不是 meta.ts：
   * 同一件事只该有一个真源，而"这个模块能不能横跨两栏"是实现的属性。
   * 未注册的类型（理论上不会出现）按 'side' 处理，宁可多显示也不要漏。
   */
  const fitsHere = (type: string): boolean => {
    const scope = getModule(type)?.scope ?? 'side'
    if (wanted === 'common') return scope === 'common' || scope === 'both'
    // 放进某一侧时排除"只能整行"的模块；'both' 与 'side' 都允许
    return scope !== 'common'
  }

  const filtered = MODULE_META.filter((meta) => {
    if (!fitsHere(meta.type)) return false
    if (!q) return true
    const haystack = [meta.type, translate(meta.titleKey), ...(meta.keywords ?? [])]
      .map((item) => normalizeForSearch(item))
      .join('|')
    return haystack.includes(q)
  })

  return groupModuleMeta(filtered)
})

function categoryLabel(category: ModuleCategory): string {
  return t(`modules.category.${category}`)
}

/**
 * 一个模块选项当前的状态标签。
 *
 * 三态（v0.4.0 起）：
 *   未实现            → 规划中（禁用，点了也没反应的东西不该给出来）
 *   已实现但未实测     → 实验（**可选**，只是如实告诉用户作者还没实测过）
 *   已实测            → 可用
 *
 * 为什么"实验"仍然可选：这个应用的核心价值是"什么都能往里放"，
 * 把二十个模块锁掉只剩三个会直接毁掉可用性。
 * 用户要的是**知情**，不是限制——他明确说了原因是"因为我还没有进行实测"。
 */
function statusOf(type: string): { label: string; tone: 'ready' | 'beta' | 'planned' } {
  if (!available.value.has(type)) return { label: t('picker.planned'), tone: 'planned' }
  if (moduleMaturity(type) === 'stable') return { label: t('picker.implemented'), tone: 'ready' }
  return { label: t('picker.experimental'), tone: 'beta' }
}

function pick(type: string): void {
  if (!available.value.has(type)) return
  emit('pick', type)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="mask"
      :class="{ 'studio-editor-fields': !!theme }"
      :data-design-theme="theme"
      @click.self="emit('close')"
    >
      <div
        ref="dialogRoot"
        class="picker"
        role="dialog"
        aria-modal="true"
        :aria-label="t('picker.title')"
      >
        <header class="picker__head">
          <h2 class="picker__title">{{ t('picker.title') }}</h2>
          <button
            class="picker__close"
            type="button"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <AppIcon name="close" :size="16" />
          </button>
        </header>

        <div class="picker__search">
          <AppIcon name="search" :size="14" class="picker__search-icon" />
          <input
            v-model="query"
            class="picker__search-input"
            type="search"
            autofocus
            :placeholder="t('picker.search')"
          />
        </div>

        <p class="picker__hint">{{ t('picker.hint') }}</p>

        <div class="picker__body u-scroll-y">
          <p v-if="groups.length === 0" class="picker__empty">{{ t('picker.empty') }}</p>

          <section v-for="group in groups" :key="group.category" class="group">
            <h3 class="group__title">{{ categoryLabel(group.category) }}</h3>
            <ul class="group__grid">
              <li v-for="meta in group.items" :key="meta.type">
                <button
                  class="card"
                  type="button"
                  :class="{ 'card--planned': !available.has(meta.type) }"
                  :disabled="!available.has(meta.type)"
                  @click="pick(meta.type)"
                >
                  <AppIcon :name="meta.icon" :size="16" class="card__icon" />
                  <span class="card__text">
                    <span class="card__name">{{ translate(meta.titleKey) }}</span>
                    <span class="card__badge" :class="`card__badge--${statusOf(meta.type).tone}`">
                      {{ statusOf(meta.type).label }}
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-overlay);
}

.picker {
  display: flex;
  flex-direction: column;
  width: min(560px, calc(100vw - 48px));
  max-height: min(620px, calc(100vh - 96px));
  padding: var(--sp-5);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
}

.picker__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-4);
}

.picker__title {
  font-size: var(--fs-lg);
}

.picker__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}

.picker__close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.picker__search {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  padding: 0 var(--sp-3);
  margin-bottom: var(--sp-2);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.picker__search-icon {
  color: var(--text-muted);
}

.picker__search-input {
  width: 100%;
  height: 32px;
  background: none;
  border: none;
  outline: none;
}

.picker__hint {
  margin-bottom: var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.picker__body {
  flex: 1;
  min-height: 0;
}

.picker__empty {
  padding: var(--sp-6);
  font-size: var(--fs-sm);
  color: var(--text-muted);
  text-align: center;
}

.group + .group {
  margin-top: var(--sp-4);
}

.group__title {
  margin-bottom: var(--sp-2);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}

.group__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--sp-2);
}

.card {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  text-align: left;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.card:hover:not(:disabled) {
  background: var(--accent-soft);
  border-color: var(--accent-500);
}

.card--planned {
  cursor: not-allowed;
  opacity: 0.45;
}

.card__icon {
  flex: none;
  color: var(--accent-500);
}

.card__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.card__name {
  font-size: var(--fs-sm);
}

.card__badge {
  font-size: 10px;
  color: var(--text-disabled);
}

/* 三种状态的角标配色：可用=成功色、实验=警示色、规划中=最弱一级 */
.card__badge--ready {
  color: var(--success);
}

.card__badge--beta {
  color: var(--warning);
}

.card__badge--planned {
  color: var(--text-disabled);
}
</style>
