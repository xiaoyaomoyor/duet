<script setup lang="ts">
/**
 * 工具库设置：内置工具（可停用）/ 自定义工具（增删改）
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import SettingsField from '@/components/common/SettingsField.vue'
import ToolIcon from '@/components/common/ToolIcon.vue'
import ToolForm from './ToolForm.vue'
import { useToolsStore } from '@/stores/useToolsStore'
import { useUiStore } from '@/stores/useUiStore'
import { searchTools } from '@/services/toolService'
import { TOOL_CATEGORIES } from '@/data/builtinTools'
import { loadLocalLogos, localLogosStatus } from '@/lib/localLogos'
import type { DisplayTool } from '@/services/toolService'
import type { ToolCategory } from '@/types/project'

const { t } = useI18n()
const tools = useToolsStore()
const ui = useUiStore()

const query = ref('')
const formOpen = ref(false)
const editing = ref<DisplayTool | null>(null)
const deleteTarget = ref<DisplayTool | null>(null)

/** 本地品牌 LOGO 目录是就绪还是空的（清单读完才知道） */
const logoStatus = ref<'unknown' | 'empty' | 'ready'>('unknown')

onMounted(async () => {
  await loadLocalLogos()
  logoStatus.value = localLogosStatus()
})

/**
 * 统一列表：内置与自定义混在一起，按分类分组。
 *
 * M9 之前是"上面一块自定义（行式，能改能删）、下面一块内置（气泡，只能停用）"，
 * 同一个东西两套长相、两套能力。用户要求整合，现在两者在界面上完全同等：
 * 都是气泡、都能勾选停用、点名字都能打开同一个编辑窗口、在窗口里都能删除。
 */
const groups = computed(() => {
  const all = searchTools(tools.allTools, query.value)
  const byCategory = new Map<ToolCategory, DisplayTool[]>()
  for (const tool of all) {
    const list = byCategory.get(tool.category) ?? []
    list.push(tool)
    byCategory.set(tool.category, list)
  }
  // 按 TOOL_CATEGORIES 的声明顺序输出，避免分类顺序随插入顺序漂移
  return TOOL_CATEGORIES.filter((item) => byCategory.has(item.id)).map((item) => ({
    category: item.id,
    items: byCategory.get(item.id) ?? [],
  }))
})

function openCreate(): void {
  editing.value = null
  formOpen.value = true
}

/** 点气泡里的名字 → 打开编辑窗口（内置与自定义走同一条路） */
function openEdit(tool: DisplayTool): void {
  editing.value = tool
  formOpen.value = true
}

/** 点对勾 → 停用 / 启用 */
async function toggleTool(tool: DisplayTool): Promise<void> {
  const key = tool.builtinKey ?? tool.id
  await tools.setDisabled(key, !tool.disabled)
}

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  deleteTarget.value = null
  if (!target) return

  const okResult = target.builtin
    ? await removeBuiltinTool(target)
    : await tools.remove(target.id)

  if (okResult) ui.notify(t('toast.toolDeleted', { name: target.name }), 'success')
  else ui.notify(tools.lastError ?? t('errors.unknown'), 'danger')
}

/** 内置工具没有"删除"这一说，只有"从我的工具库里移除"（可在同一处恢复） */
async function removeBuiltinTool(tool: DisplayTool): Promise<boolean> {
  if (!tool.builtinKey) return false
  await tools.removeBuiltin(tool.builtinKey)
  return true
}

/**
 * 编辑窗口里的删除入口 → 关掉编辑窗、弹出二次确认。
 *
 * 必须先关编辑窗：两个模态叠在一起时，确认框会被编辑窗的遮罩盖住，
 * 点不到（而且两个遮罩都会拦截点击）。
 */
function onRequestDelete(tool: DisplayTool): void {
  formOpen.value = false
  deleteTarget.value = tool
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

  <!--
    统一工具列表（M9）。
    内置与自定义**完全同等**：都是气泡、都能勾选停用、点名字都能进编辑窗口、
    在窗口里都能删除。此前两者是两套长相两套能力，用户要求整合。
  -->
  <section class="group">
    <header class="group__head">
      <span class="group__title">{{ t('tools.library') }}</span>
      <span class="group__hint">{{ t('tools.chipHint') }}</span>
      <button
        v-if="tools.removedCount > 0 || tools.disabledCount > 0"
        class="ghost-btn"
        type="button"
        @click="tools.restoreBuiltins()"
      >
        {{ t('tools.restoreBuiltins') }}
      </button>
      <button class="ghost-btn" type="button" @click="openCreate">
        <AppIcon name="plus" :size="14" />
        {{ t('tools.newTool') }}
      </button>
    </header>

    <p v-if="groups.length === 0" class="group__empty">{{ t('tools.noResults') }}</p>

    <div v-for="group in groups" :key="group.category" class="cat">
      <p class="cat__title">{{ t(tools.categoryLabelKey(group.category)) }}</p>
      <ul class="tool-grid">
        <li
          v-for="tool in group.items"
          :key="tool.id"
          class="chip"
          :class="{ 'chip--off': tool.disabled, 'chip--custom': !tool.builtin }"
          :data-tool="tool.name"
        >
          <ToolIcon
            :name="tool.name"
            :color="tool.color"
            :icon-asset-id="tool.iconAssetId"
            :logo-key="tool.builtinKey ?? tool.id"
            :size="20"
          />
          <!-- 点名字 = 打开编辑窗口（内置工具在窗口里写的是"本地改写"） -->
          <button
            class="chip__name"
            type="button"
            :title="t('tools.editTool')"
            @click="openEdit(tool)"
          >
            {{ tool.name }}
          </button>
          <span v-if="tool.overridden" class="chip__badge" :title="t('tools.overridden')">✎</span>
          <button
            class="chip__toggle"
            type="button"
            :aria-pressed="!tool.disabled"
            :title="tool.disabled ? t('common.enable') : t('common.disable')"
            :aria-label="tool.disabled ? t('common.enable') : t('common.disable')"
            @click="toggleTool(tool)"
          >
            <AppIcon :name="tool.disabled ? 'plus' : 'check'" :size="12" />
          </button>
        </li>
      </ul>
    </div>
  </section>

  <!--
    免责声明（用户要求：想用真实品牌 LOGO，但要明确规避版权风险）。
    放在工具库底部而不是藏在"关于"里——用户正是在这一屏看到工具图标，
    提示只有出现在这里才起作用。

    M9 增加一行**状态**：本地 LOGO 目录是空的还是就绪的。
    在此之前这个能力失败时界面上一片安静，用户只会看到一堆字母方块，
    完全分不清"这些品牌本来就没有图标"和"我的本地目录是空的"——
    而这两者的处理方式完全不同（后者跑一次 npm run logos 就好）。
  -->
  <section class="disclaimer">
    <h4 class="disclaimer__title">
      <AppIcon name="info" :size="14" />
      {{ t('tools.disclaimerTitle') }}
    </h4>
    <p class="disclaimer__text">{{ t('tools.disclaimerTrademark') }}</p>
    <p class="disclaimer__text">{{ t('tools.disclaimerIcons') }}</p>
    <p class="disclaimer__text disclaimer__text--local">{{ t('tools.disclaimerLocalLogos') }}</p>
    <p
      v-if="logoStatus !== 'ready'"
      class="disclaimer__text disclaimer__status"
      data-testid="logo-status"
    >
      <AppIcon name="info" :size="12" />
      {{ logoStatus === 'empty' ? t('tools.logosMissing') : t('tools.logosUnknown') }}
    </p>
  </section>

  <ToolForm
    :open="formOpen"
    :tool="editing"
    @close="formOpen = false"
    @saved="onSaved"
    @request-delete="onRequestDelete"
  />

  <AppDialog
    :open="deleteTarget !== null"
    tone="danger"
    :title="t('common.delete')"
    :message="deleteTarget?.builtin ? t('tools.removeBuiltinConfirm') : t('tools.deleteConfirm')"
    :confirm-label="deleteTarget?.builtin ? t('tools.removeBuiltin') : t('common.delete')"
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

/*
 * LOGO 状态提示：只在"不是就绪"时才出现。
 * 用 --warning 而不是 --danger —— 这不是错误，只是缺一步可选操作。
 */
.disclaimer__status {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-top: var(--sp-2);
  margin-bottom: 0;
  color: var(--warning);
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

/* 自定义工具用虚线描边区分来源——它与内置工具能力相同，只是出处不同 */
.chip--custom {
  border-style: dashed;
}

.chip--off {
  opacity: 0.5;
}

.chip__name {
  max-width: 120px;
  overflow: hidden;
  font-size: var(--fs-xs);
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip__name:hover {
  color: var(--accent-500);
  text-decoration: underline;
}

/* "已自定义"角标：提醒这个内置工具被本地改写过，官方更新不会再覆盖它 */
.chip__badge {
  font-size: 10px;
  color: var(--accent-500);
}

.cat + .cat {
  margin-top: var(--sp-3);
}

.cat__title {
  margin-bottom: var(--sp-1);
  font-size: var(--fs-xs);
  color: var(--text-muted);
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
