<script setup lang="ts">
/**
 * 工具选择器（用于给对比的某一方指定"生产源"）
 *
 * 这是 M6 补上的功能：在此之前 `side.toolRef` 全项目**只被读取**，
 * 没有任何界面能修改它——模板建出来的对比永远停在「工具 A / 工具 B」，
 * 而 SideHeader 上的名称按钮 tooltip 写着"更换工具"、点下去却只是改名。
 *
 * 设计：搜索 + 按分类分组列表。选中即生效（不需要"确定"），
 * 因为选择本身是幂等的、可撤销的（走命令层）。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import ToolIcon from '@/components/common/ToolIcon.vue'
import { useToolsStore } from '@/stores/useToolsStore'
import type { ToolRef } from '@/types/project'

const props = defineProps<{
  /** 当前选中的工具引用，用于高亮 */
  current: ToolRef
}>()

const emit = defineEmits<{ select: [toolRef: ToolRef] }>()

const { t } = useI18n()
const tools = useToolsStore()

const query = ref('')

/** 分组过滤：搜索时同时匹配名称、厂商与别名 */
const groups = computed(() => {
  const keyword = query.value.trim().toLowerCase()

  return tools.grouped
    .map((group) => ({
      key: group.key,
      items: group.items.filter((tool) => {
        if (!keyword) return true
        return (
          tool.name.toLowerCase().includes(keyword) ||
          tool.vendor.toLowerCase().includes(keyword) ||
          tool.aliases.some((alias) => alias.toLowerCase().includes(keyword))
        )
      }),
    }))
    .filter((group) => group.items.length > 0)
})

const total = computed(() => groups.value.reduce((sum, group) => sum + group.items.length, 0))

/** 当前选中的工具 id（inline 工具没有 id，用空串表示"没选库里的工具"） */
const currentId = computed(() => (props.current.kind === 'inline' ? '' : props.current.toolId))

function pick(id: string, builtin: boolean): void {
  emit('select', builtin ? { kind: 'builtin', toolId: id } : { kind: 'custom', toolId: id })
}
</script>

<template>
  <div class="picker">
    <label class="picker__search">
      <AppIcon name="search" :size="14" />
      <input
        v-model="query"
        type="search"
        :placeholder="t('tools.searchPlaceholder')"
        :aria-label="t('tools.searchPlaceholder')"
      />
    </label>

    <div class="picker__list" role="listbox" :aria-label="t('compare.changeTool')">
      <template v-for="group in groups" :key="group.key">
        <p class="picker__group">{{ t(tools.categoryLabelKey(group.key)) }}</p>
        <button
          v-for="tool in group.items"
          :key="tool.id"
          class="picker__item"
          type="button"
          role="option"
          :aria-selected="tool.id === currentId"
          :class="{ 'picker__item--active': tool.id === currentId }"
          @click="pick(tool.id, tool.builtin)"
        >
          <ToolIcon
            :name="tool.name"
            :color="tool.color"
            :icon-asset-id="tool.iconAssetId"
            :logo-key="tool.builtinKey ?? tool.id"
            :size="24"
          />
          <span class="picker__name">{{ tool.name }}</span>
          <span v-if="tool.vendor" class="picker__vendor">{{ tool.vendor }}</span>
          <AppIcon v-if="tool.id === currentId" name="check" :size="14" class="picker__check" />
        </button>
      </template>

      <p v-if="total === 0" class="picker__empty">{{ t('tools.noResults') }}</p>
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-height: 0;
}

.picker__search {
  display: flex;
  flex: none;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-2) var(--sp-3);
  color: var(--text-muted);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.picker__search input {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-sm);
  background: none;
  border: none;
  outline: none;
}

.picker__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 320px;
  padding-right: var(--sp-1);
  overflow-y: auto;
}

.picker__group {
  position: sticky;
  top: 0;
  z-index: 1;
  margin-top: var(--sp-2);
  padding: var(--sp-1) 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  background: var(--bg-elevated);
}

.picker__item {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-2);
  text-align: left;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  transition: background var(--dur-fast) var(--ease-out);
}

.picker__item:hover {
  background: var(--bg-hover);
}

.picker__item--active {
  background: var(--accent-soft);
  border-color: var(--accent-500);
}

.picker__name {
  flex: none;
  font-size: var(--fs-sm);
  color: var(--text-primary);
}

.picker__vendor {
  overflow: hidden;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker__check {
  margin-left: auto;
  color: var(--accent-500);
}

.picker__empty {
  padding: var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--text-muted);
  text-align: center;
}
</style>
