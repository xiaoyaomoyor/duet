<script setup lang="ts">
/**
 * 工具卡片编辑弹窗
 *
 * 卡片本身在编辑视图里"就是最终效果"，所有调整都在这里：
 *   ① 从工具库选择工具（M6 之前这个能力根本不存在，见 ToolPicker 的说明）
 *   ② 名称与版本（名称可覆盖工具原名，如「可灵 · 1.6 大师版」）
 *   ③ 备注
 *   ④ 替换图标（存为本侧专属的资源，不污染工具库）
 *   ⑤ 图标 / 名称 / 版本 / 备注 各自是否显示
 *
 * 与模块编辑弹窗一致：改动即时保存，底部只有"完成"。
 */
import { computed, onBeforeUnmount, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import MediaPicker from '@/components/media/MediaPicker.vue'
import ToolPicker from './ToolPicker.vue'
import { useToolsStore } from '@/stores/useToolsStore'
import type { Side, ToolRef } from '@/types/project'

const props = defineProps<{
  open: boolean
  side: Side
  /** 当前显示用的名称（可能是 labelOverride） */
  displayName: string
}>()

const emit = defineEmits<{
  close: []
  /** 写入侧字段（走项目的命令层） */
  patch: [patch: Record<string, unknown>]
}>()

const { t } = useI18n()
const tools = useToolsStore()

const tool = computed(() => tools.resolve(props.side.toolRef))

/** 开关类字段：省略 = 显示，只有显式 false 才隐藏 */
const toggles = computed(() => [
  { key: 'showIcon' as const, labelKey: 'compare.showIcon', value: props.side.showIcon !== false },
  { key: 'showName' as const, labelKey: 'compare.showName', value: props.side.showName !== false },
  {
    key: 'showVersion' as const,
    labelKey: 'compare.showVersion',
    value: props.side.showVersion !== false,
  },
  { key: 'showNote' as const, labelKey: 'compare.showNote', value: props.side.showNote !== false },
])

function onSelectTool(toolRef: ToolRef): void {
  // 换工具时清掉名称覆盖：否则会留下上一个工具的名字，很困惑
  emit('patch', { toolRef, labelOverride: undefined })
}

/** 名称输入用 change 而不是 input：避免每敲一个字都进撤销栈 */
function onNameChange(event: Event): void {
  const value = (event.target as HTMLInputElement).value.trim()
  emit('patch', { labelOverride: value && value !== tool.value.name ? value : undefined })
}

function onVersionChange(event: Event): void {
  emit('patch', { modelVersion: (event.target as HTMLInputElement).value.trim() || undefined })
}

function onNoteChange(event: Event): void {
  emit('patch', { note: (event.target as HTMLInputElement).value.trim() || undefined })
}

function onToggle(key: string, value: boolean): void {
  emit('patch', { [key]: value })
}

/*
 * Esc 监听在 window 上而不是弹窗元素上：
 * 挂在元素上要求"焦点恰好在弹窗内"，自动聚焦一旦失败 Esc 就失效，
 * 模态遮罩会留在页面上拦截所有后续点击（这个坑在模块编辑弹窗里已经踩过）。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mask" role="presentation" @click.self="emit('close')">
      <div
        class="side-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('compare.editSide', { name: displayName })"
        :style="{ '--accent': side.accent }"
        tabindex="-1"
      >
        <header class="side-dialog__head">
          <AppIcon name="options" :size="16" class="side-dialog__icon" />
          <h2 class="side-dialog__title">{{ t('compare.editSide', { name: displayName }) }}</h2>
          <button
            class="side-dialog__close"
            type="button"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <AppIcon name="close" :size="15" />
          </button>
        </header>

        <div class="side-dialog__body">
          <section class="section">
            <h3 class="section__title">{{ t('compare.changeTool') }}</h3>
            <ToolPicker :current="side.toolRef" @select="onSelectTool" />
          </section>

          <section class="section">
            <h3 class="section__title">{{ t('compare.textFields') }}</h3>

            <label class="field">
              <span class="field__label">{{ t('compare.name') }}</span>
              <input
                class="field__control"
                type="text"
                :value="side.labelOverride ?? tool.name"
                :placeholder="tool.name"
                @change="onNameChange"
              />
            </label>

            <label class="field">
              <span class="field__label">{{ t('compare.version') }}</span>
              <input
                class="field__control"
                type="text"
                :value="side.modelVersion ?? ''"
                :placeholder="t('compare.versionPlaceholder')"
                @change="onVersionChange"
              />
            </label>

            <label class="field">
              <span class="field__label">{{ t('compare.note') }}</span>
              <input
                class="field__control"
                type="text"
                :value="side.note ?? ''"
                :placeholder="t('compare.notePlaceholder')"
                @change="onNoteChange"
              />
            </label>
          </section>

          <section class="section">
            <h3 class="section__title">{{ t('compare.icon') }}</h3>
            <p class="section__hint">{{ t('compare.iconHint') }}</p>
            <MediaPicker
              accept="image"
              :asset-id="side.iconAssetId"
              :name="displayName"
              :preview-height="72"
              @select="(payload) => emit('patch', { iconAssetId: payload.assetId || undefined })"
              @clear="emit('patch', { iconAssetId: undefined })"
            />
          </section>

          <section class="section">
            <h3 class="section__title">{{ t('compare.visibleParts') }}</h3>
            <label v-for="item in toggles" :key="item.key" class="toggle">
              <input
                type="checkbox"
                :checked="item.value"
                @change="onToggle(item.key, ($event.target as HTMLInputElement).checked)"
              />
              <span>{{ t(item.labelKey) }}</span>
            </label>
          </section>
        </div>

        <footer class="side-dialog__foot">
          <span class="side-dialog__note">{{ t('module.autosaveNote') }}</span>
          <button class="btn btn--primary" type="button" @click="emit('close')">
            {{ t('common.done') }}
          </button>
        </footer>
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
  padding: var(--sp-6);
  background: var(--bg-overlay);
  backdrop-filter: blur(2px);
}

.side-dialog {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(780px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-pop);
  animation: duet-pop-in var(--dur-base) var(--ease-spring) both;
}

.side-dialog__head {
  display: flex;
  flex: none;
  gap: var(--sp-2);
  align-items: center;
  padding: var(--sp-4) var(--sp-5);
  border-bottom: 1px solid var(--border-subtle);
}

.side-dialog__icon {
  color: var(--accent, var(--accent-500));
}

.side-dialog__title {
  flex: 1;
  overflow: hidden;
  font-size: var(--fs-md);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-dialog__close {
  flex: none;
  padding: var(--sp-1);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
}

.side-dialog__close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.side-dialog__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--sp-5);
  padding: var(--sp-5);
  overflow-y: auto;
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.section__title {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.section__hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.field__label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.field__control {
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-sm);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.toggle {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.side-dialog__foot {
  display: flex;
  flex: none;
  gap: var(--sp-3);
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-3) var(--sp-5);
  border-top: 1px solid var(--border-subtle);
}

.side-dialog__note {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.btn {
  padding: var(--sp-2) var(--sp-5);
  font-size: var(--fs-sm);
  border-radius: var(--radius-sm);
}

.btn--primary {
  color: var(--accent-fg);
  background: var(--accent-600);
  border: 1px solid var(--accent-600);
}

.btn--primary:hover {
  background: var(--accent-700);
}
</style>
