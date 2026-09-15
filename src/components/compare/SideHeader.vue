<script setup lang="ts">
/**
 * 对比方头部（工具名 / 图标 / 版本号 / 备注）
 *
 * M1：全部字段可编辑（走 store 的命令层，因此可撤销、可自动保存）。
 * M2：图标可点击替换、接入工具选择器。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolIcon from '@/components/common/ToolIcon.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useToolsStore } from '@/stores/useToolsStore'
import { hexToSoft } from '@/lib/color'
import type { Side, SideId } from '@/types/project'

const props = defineProps<{
  side: Side
  sideId: SideId
  readonly?: boolean
}>()

const { t } = useI18n()
const project = useProjectStore()
const tools = useToolsStore()

const tool = computed(() => tools.resolve(props.side.toolRef))
const displayName = computed(() => props.side.labelOverride ?? tool.value.name)

/** 行内编辑：名称与版本号都是"点击即改" */
const editing = ref<'name' | 'version' | 'note' | null>(null)
const draft = ref('')

function startEdit(field: 'name' | 'version' | 'note'): void {
  if (props.readonly) return
  editing.value = field
  draft.value =
    field === 'name'
      ? (props.side.labelOverride ?? tool.value.name)
      : field === 'version'
        ? (props.side.modelVersion ?? '')
        : (props.side.note ?? '')
}

function commit(): void {
  if (!editing.value) return
  const value = draft.value.trim()

  if (editing.value === 'name') {
    // 与工具原名一致时不再存 labelOverride，避免无意义的覆盖
    project.setSideField(props.sideId, { labelOverride: value && value !== tool.value.name ? value : undefined })
  } else if (editing.value === 'version') {
    project.setSideField(props.sideId, { modelVersion: value || undefined })
  } else {
    project.setSideField(props.sideId, { note: value || undefined })
  }

  editing.value = null
}

function cancel(): void {
  editing.value = null
}

// 工具切换后若正在编辑名称，需要同步显示新名称
watch(tool, () => {
  if (editing.value === 'name') cancel()
})

const headerStyle = computed(() => ({
  '--accent': props.side.accent,
  '--accent-soft': hexToSoft(props.side.accent, 10),
}))
</script>

<template>
  <header class="side-head" :style="headerStyle">
    <div class="side-head__bar" aria-hidden="true" />

    <div class="side-head__body">
      <ToolIcon
        :name="tool.name"
        :color="tool.color"
        :icon-asset-id="tool.iconAssetId"
        :size="40"
      />

      <div class="side-head__text">
        <input
          v-if="editing === 'name'"
          v-model="draft"
          class="side-head__input side-head__input--title"
          type="text"
          autofocus
          @blur="commit"
          @keydown.enter.prevent="commit"
          @keydown.esc.prevent="cancel"
        />
        <button
          v-else
          class="side-head__name"
          type="button"
          :disabled="readonly"
          :title="readonly ? undefined : t('compare.changeTool')"
          @click="startEdit('name')"
        >
          {{ displayName }}
        </button>

        <input
          v-if="editing === 'version'"
          v-model="draft"
          class="side-head__input side-head__input--version"
          type="text"
          autofocus
          :placeholder="t('compare.versionPlaceholder')"
          @blur="commit"
          @keydown.enter.prevent="commit"
          @keydown.esc.prevent="cancel"
        />
        <button
          v-else
          class="side-head__version"
          type="button"
          :disabled="readonly"
          @click="startEdit('version')"
        >
          {{ side.modelVersion || t('compare.versionPlaceholder') }}
        </button>

        <input
          v-if="editing === 'note'"
          v-model="draft"
          class="side-head__input side-head__input--note"
          type="text"
          autofocus
          @blur="commit"
          @keydown.enter.prevent="commit"
          @keydown.esc.prevent="cancel"
        />
        <button
          v-else
          class="side-head__note"
          type="button"
          :disabled="readonly"
          @click="startEdit('note')"
        >
          {{ side.note || t('compare.notePlaceholder') }}
        </button>
      </div>

      <span v-if="tool.inline" class="side-head__badge">{{ t('compare.noTool') }}</span>
    </div>
  </header>
</template>

<style scoped>
.side-head {
  overflow: hidden;
  background: var(--accent-soft, var(--bg-surface));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}

.side-head__bar {
  height: 2px;
  background: var(--accent, var(--accent-500));
}

.side-head__body {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  padding: var(--sp-4);
}

.side-head__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.side-head__name {
  overflow: hidden;
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--text-primary);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-head__version,
.side-head__note {
  overflow: hidden;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-head__name:hover:not(:disabled),
.side-head__version:hover:not(:disabled),
.side-head__note:hover:not(:disabled) {
  color: var(--accent, var(--accent-500));
}

.side-head__input {
  min-width: 0;
  padding: 2px var(--sp-2);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.side-head__input--title {
  font-size: var(--fs-lg);
  font-weight: 600;
}

.side-head__input--version,
.side-head__input--note {
  font-size: var(--fs-xs);
}

.side-head__badge {
  flex: none;
  padding: 1px 6px;
  font-size: 10px;
  color: var(--warning);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}
</style>
