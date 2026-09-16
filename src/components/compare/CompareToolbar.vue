<script setup lang="ts">
/**
 * 对比页工具条 —— 对比页的"第一行"
 *
 * M7 从顶栏搬过来的那一组操作：保存状态 / 切换视图 / 属性 / 导入 / 导出。
 * 搬家的理由：这五个按钮全都**只对当前这份对比有意义**，
 * 钉在全局顶栏上时，用户在设置页面看到"导出"会以为能导出设置；
 * 而空状态（没有项目）下它们大多是禁用的，白占一排位置。
 *
 * 顶栏腾出来的空间给了"对比 / 设置"两个页面级入口。
 *
 * 顺序（左 → 右）：保存状态 … 视图切换 · 属性 · 导入 · 导出。
 * 保存状态在最左是因为它是**只读的状态指示**，混在按钮堆里会被当成按钮；
 * 其余四个是从"看"到"出"的自然顺序：先决定怎么看，再看参数，最后进进出出。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { useProjectImport } from '@/composables/useProjectImport'

const { t } = useI18n()
const project = useProjectStore()
const ui = useUiStore()
const { setInput, importing, accept, triggerImport, onFilePicked } = useProjectImport()

const saveState = computed<'saved' | 'saving' | 'dirty'>(() => {
  if (project.saving) return 'saving'
  if (project.dirty) return 'dirty'
  return 'saved'
})

const saveLabel = computed(() =>
  saveState.value === 'saving'
    ? t('compare.saving')
    : saveState.value === 'dirty'
      ? t('compare.unsaved')
      : t('compare.saved'),
)
</script>

<template>
  <div class="compare-toolbar">
    <span
      class="compare-toolbar__save"
      :class="`compare-toolbar__save--${saveState}`"
      role="status"
      aria-live="polite"
    >
      {{ saveLabel }}
    </span>

    <div class="compare-toolbar__actions">
      <button
        class="compare-toolbar__btn"
        type="button"
        :title="t('inspector.title')"
        :aria-label="t('inspector.title')"
        :aria-pressed="ui.inspectorOpen"
        @click="ui.toggleInspector()"
      >
        <!--
          开 / 合各一个图标：与侧栏折叠同一套做法（用户实测反馈"图标应该能区分状态"）。
          方向朝右，因为对比配置在右边。
        -->
        <AppIcon :name="ui.inspectorOpen ? 'configCollapse' : 'configExpand'" :size="15" />
      </button>

      <button
        class="compare-toolbar__btn"
        type="button"
        :disabled="importing"
        :title="t('nav.import')"
        :aria-label="t('nav.import')"
        @click="triggerImport"
      >
        <AppIcon name="import" :size="15" />
      </button>

      <button
        class="compare-toolbar__btn"
        type="button"
        :title="t('export.menu')"
        :aria-label="t('export.menu')"
        @click="ui.openExport()"
      >
        <AppIcon name="export" :size="15" />
      </button>
    </div>

    <input
      :ref="setInput"
      class="u-visually-hidden"
      type="file"
      :accept="accept"
      @change="onFilePicked"
    />
  </div>
</template>

<style scoped>
.compare-toolbar {
  display: flex;
  flex: none;
  gap: var(--sp-3);
  align-items: center;
  height: var(--size-toolbar);
  padding: 0 var(--sp-4);
  background: var(--bg-base);
  border-bottom: 1px solid var(--border-subtle);
}

.compare-toolbar__save {
  font-size: var(--fs-xs);
  color: var(--text-disabled);
  transition: color var(--dur-base) var(--ease-out);
}

.compare-toolbar__save--saving {
  color: var(--accent-500);
}

.compare-toolbar__save--dirty {
  color: var(--warning);
}

.compare-toolbar__actions {
  display: flex;
  gap: var(--sp-1);
  align-items: center;
  margin-left: auto;
}

.compare-toolbar__btn {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  transition:
    background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.compare-toolbar__btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.compare-toolbar__btn:disabled {
  color: var(--text-disabled);
}

/* 带文字的那个按钮多给一点左右内边距，否则文字会贴到图标上 */
.compare-toolbar__btn-text {
  padding-right: 2px;
}
</style>
