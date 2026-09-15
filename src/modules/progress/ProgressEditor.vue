<script setup lang="ts">
/**
 * 进度条编辑器
 *
 * 可从"本侧已有的音频/视频资源"中挑选绑定对象，
 * 也可以不绑定、手工填一个时长（用于对比"生成耗时"）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { formatDuration } from '@/lib/time'
import { useAssetsStore } from '@/stores/useAssetsStore'
import type { ModuleEditorProps } from '../types'
import type { ProgressData } from './data'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()
const assets = useAssetsStore()

const data = computed<ProgressData>(() => {
  const raw = props.module.data as Partial<ProgressData> | undefined
  return {
    ...(raw?.assetId ? { assetId: raw.assetId } : {}),
    ...(raw?.manualDurationMs ? { manualDurationMs: raw.manualDurationMs } : {}),
    showTime: raw?.showTime !== false,
    showWaveform: raw?.showWaveform !== false,
  }
})

/** 可绑定的候选：本机已导入的音视频 */
const candidates = computed(() =>
  assets.items.filter((item) => item.kind === 'audio' || item.kind === 'video'),
)

function bind(assetId: string): void {
  props.patchData({ assetId: assetId || undefined })
}

function setManual(value: string): void {
  const seconds = Number(value)
  props.patchData({
    manualDurationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined,
  })
}
</script>

<template>
  <div class="editor">
    <div class="editor__row">
      <label class="editor__label">{{ t('progress.bindAsset') }}</label>
      <select
        class="editor__control"
        :value="data.assetId ?? ''"
        :disabled="readonly"
        @change="bind(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ t('progress.notBound') }}</option>
        <option v-for="item in candidates" :key="item.id" :value="item.id">
          {{ item.name }}
          <template v-if="item.derived?.durationMs">
            （{{ formatDuration(item.derived.durationMs) }}）
          </template>
        </option>
      </select>
    </div>

    <div v-if="!data.assetId" class="editor__row">
      <label class="editor__label">{{ t('progress.manualDuration') }}</label>
      <div class="editor__inline">
        <input
          class="editor__control"
          type="number"
          min="1"
          step="1"
          :readonly="readonly"
          :value="data.manualDurationMs ? Math.round(data.manualDurationMs / 1000) : ''"
          :placeholder="t('progress.secondsPlaceholder')"
          @change="setManual(($event.target as HTMLInputElement).value)"
        />
        <span class="editor__unit">{{ t('progress.seconds') }}</span>
      </div>
    </div>

    <div class="editor__row editor__row--inline">
      <label class="editor__check">
        <input
          type="checkbox"
          :checked="data.showTime"
          :disabled="readonly"
          @change="patchData({ showTime: ($event.target as HTMLInputElement).checked })"
        />
        <span>{{ t('progress.showTime') }}</span>
      </label>
      <label class="editor__check">
        <input
          type="checkbox"
          :checked="data.showWaveform"
          :disabled="readonly"
          @change="patchData({ showWaveform: ($event.target as HTMLInputElement).checked })"
        />
        <span>{{ t('progress.showWaveform') }}</span>
      </label>
    </div>

    <p v-if="candidates.length === 0" class="editor__hint">
      <AppIcon name="comment" :size="13" />
      {{ t('progress.noCandidates') }}
    </p>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.editor__row {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.editor__row--inline {
  flex-direction: row;
  gap: var(--sp-4);
}

.editor__label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.editor__control {
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.editor__inline {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.editor__unit {
  flex: none;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.editor__check {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.editor__hint {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}
</style>
