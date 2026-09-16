<script setup lang="ts">
/**
 * 工具库设置：内置工具（可停用）/ 自定义工具（增删改）
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import SettingsField from '@/components/common/SettingsField.vue'
import ToolIcon from '@/components/common/ToolIcon.vue'
import ToolForm from './ToolForm.vue'
import { useToolsStore } from '@/stores/useToolsStore'
import { useUiStore } from '@/stores/useUiStore'
import { searchTools } from '@/services/toolService'
import type { DisplayTool } from '@/services/toolService'

const { t } = useI18n()
const tools = useToolsStore()
const ui = useUiStore()

const query = ref('')
const formOpen = ref(false)
const editing = ref<DisplayTool | null>(null)
const deleteTarget = ref<DisplayTool | null>(null)

const customList = computed(() => searchTools(tools.customTools.map(toDisplay), query.value))
const builtinList = computed(() =>
  query.value.trim()
    ? searchTools(tools.allBuiltins, query.value)
    : tools.allBuiltins,
)

const hasCustom = computed(() => tools.customCount > 0)

function toDisplay(tool: (typeof tools.customTools)[number]): DisplayTool {
  return {
    id: tool.id,
    name: tool.name,
    vendor: tool.vendor ?? '',
    category: tool.category,
    color: tool.color ?? '#8c82aa',
    aliases: [...tool.aliases],
    builtin: false,
    disabled: false,
    inline: false,
    ...(tool.iconAssetId ? { iconAssetId: tool.iconAssetId } : {}),
    ...(tool.homepage ? { homepage: tool.homepage } : {}),
  }
}

function openCreate(): void {
  editing.value = null
  formOpen.value = true
}

function openEdit(tool: DisplayTool): void {
  editing.value = tool
  formOpen.value = true
}

async function toggleBuiltin(key: string, disabled: boolean): Promise<void> {
  if (!key) return
  await tools.setBuiltinDisabled(key, disabled)
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  deleteTarget.value = null
  if (!target) return

  const okResult = await tools.remove(target.id)
  if (okResult) ui.notify(t('toast.toolDeleted', { name: target.name }), 'success')
  else ui.notify(tools.lastError ?? t('errors.unknown'), 'danger')
}

function onSaved(name: string): void {
  ui.notify(
    editing.value
      ? t('toast.toolUpdated', { name })
      : t('toast.toolCreated', { name }),
    'success',
  )
}
</script>

<template>
  <h3 class="panel__heading">{{ t('settings.tools') }}</h3>

  <p class="panel__summary">
    {{
      t('tools.countSummary', {
        builtin: tools.builtinCount,
        custom: tools.customCount,
        disabled: tools.disabledCount,
      })
    }}
  </p>

  <SettingsField :label="t('tools.library')">
    <div class="search">
      <AppIcon name="search" :size="14" class="search__icon" />
      <input v-model="query" class="search__input" type="search" :placeholder="t('tools.searchPlaceholder')" />
    </div>
  </SettingsField>

  <!-- 自定义工具 -->
  <section class="group">
    <header class="group__head">
      <span class="group__title">{{ t('tools.custom') }}</span>
      <span class="group__hint">{{ t('tools.customHint') }}</span>
      <button class="ghost-btn" type="button" @click="openCreate">
        <AppIcon name="plus" :size="14" />
        {{ t('tools.newTool') }}
      </button>
    </header>

    <p v-if="!hasCustom" class="group__empty">{{ t('tools.noCustom') }}</p>

    <ul v-else class="tool-list">
      <li v-for="tool in customList" :key="tool.id" class="tool-row">
        <ToolIcon
          :name="tool.name"
          :color="tool.color"
          :icon-asset-id="tool.iconAssetId"
          :logo-key="tool.builtinKey ?? tool.id"
          :size="26"
        />
        <span class="tool-row__text">
          <span class="tool-row__name">{{ tool.name }}</span>
          <span class="tool-row__meta">
            {{ tool.vendor || t('common.none') }} · {{ t(tools.categoryLabelKey(tool.category)) }}
          </span>
        </span>
        <button class="icon-btn" type="button" :title="t('common.edit')" @click="openEdit(tool)">
          <AppIcon name="settings" :size="14" />
        </button>
        <button
          class="icon-btn icon-btn--danger"
          type="button"
          :title="t('common.delete')"
          @click="deleteTarget = tool"
        >
          <AppIcon name="trash" :size="14" />
        </button>
      </li>
    </ul>
  </section>

  <!-- 内置工具 -->
  <section class="group">
    <header class="group__head">
      <span class="group__title">{{ t('tools.builtin') }}</span>
      <span class="group__hint">{{ t('tools.builtinHint') }}</span>
      <button
        v-if="tools.disabledCount > 0"
        class="ghost-btn"
        type="button"
        @click="tools.restoreBuiltins()"
      >
        {{ t('tools.restoreBuiltins') }}
      </button>
    </header>

    <ul class="tool-grid">
      <li v-for="tool in builtinList" :key="tool.id" class="chip" :class="{ 'chip--off': tool.disabled }">
        <ToolIcon
          :name="tool.name"
          :color="tool.color"
          :icon-asset-id="tool.iconAssetId"
          :logo-key="tool.builtinKey ?? tool.id"
          :size="20"
        />
        <span class="chip__name u-truncate">{{ tool.name }}</span>
        <button
          class="chip__toggle"
          type="button"
          :aria-pressed="!tool.disabled"
          :title="tool.disabled ? t('common.enable') : t('common.disable')"
          @click="toggleBuiltin(tool.builtinKey ?? '', !tool.disabled)"
        >
          <AppIcon :name="tool.disabled ? 'plus' : 'check'" :size="12" />
        </button>
      </li>
    </ul>
  </section>

  <!--
    免责声明（用户要求：想用真实品牌 LOGO，但要明确规避版权风险）。
    放在工具库底部而不是藏在"关于"里——用户正是在这一屏看到工具图标，
    提示只有出现在这里才起作用。
  -->
  <section class="disclaimer">
    <h4 class="disclaimer__title">
      <AppIcon name="info" :size="14" />
      {{ t('tools.disclaimerTitle') }}
    </h4>
    <p class="disclaimer__text">{{ t('tools.disclaimerTrademark') }}</p>
    <p class="disclaimer__text">{{ t('tools.disclaimerIcons') }}</p>
    <p class="disclaimer__text disclaimer__text--local">{{ t('tools.disclaimerLocalLogos') }}</p>
  </section>

  <ToolForm
    :open="formOpen"
    :tool="editing"
    @close="formOpen = false"
    @saved="onSaved"
  />

  <AppDialog
    :open="deleteTarget !== null"
    tone="danger"
    :title="t('common.delete')"
    :message="t('tools.deleteConfirm')"
    :confirm-label="t('common.delete')"
    @confirm="confirmDelete"
    @cancel="deleteTarget = null"
  />
</template>

<style scoped>
.panel__heading {
  margin-bottom: var(--sp-2);
  font-size: var(--fs-lg);
}

.panel__summary {
  margin-bottom: var(--sp-5);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

/* 免责声明：视觉上刻意"安静"，但必须清晰可读（用 --text-secondary 而非更弱的色） */
.disclaimer {
  margin-top: var(--sp-8);
  padding: var(--sp-4);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.disclaimer__title {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-bottom: var(--sp-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.disclaimer__text {
  margin-bottom: var(--sp-1);
  font-size: var(--fs-xs);
  line-height: var(--lh-normal);
  color: var(--text-secondary);
}

.disclaimer__text--local {
  margin-bottom: 0;
  color: var(--text-muted);
}

.search {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  padding: 0 var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
}

.search__icon {
  color: var(--text-muted);
}

.search__input {
  width: 100%;
  height: 30px;
  background: none;
  border: none;
  outline: none;
}

.group {
  margin-bottom: var(--sp-6);
}

.group__head {
  display: flex;
  gap: var(--sp-2);
  align-items: baseline;
  margin-bottom: var(--sp-3);
}

.group__title {
  font-size: var(--fs-sm);
  font-weight: 600;
}

.group__hint {
  flex: 1;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.group__empty {
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}

.tool-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.tool-row {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.tool-row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.tool-row__name {
  font-size: var(--fs-sm);
}

.tool-row__meta {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--text-muted);
  border-radius: var(--radius-xs);
}

.icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.icon-btn--danger:hover {
  color: var(--danger);
}

.tool-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}

.chip {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  padding: 2px 4px 2px 6px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.chip--off {
  opacity: 0.5;
}

.chip__name {
  max-width: 110px;
  font-size: var(--fs-xs);
}

.chip__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--text-muted);
  border-radius: var(--radius-full);
}

.chip__toggle:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.ghost-btn {
  display: inline-flex;
  gap: var(--sp-1);
  align-items: center;
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-full);
}

.ghost-btn:hover {
  color: var(--text-primary);
}
</style>
