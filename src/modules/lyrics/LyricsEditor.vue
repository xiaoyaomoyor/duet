<script setup lang="ts">
/**
 * 歌词编辑器
 *
 * 关键交互：
 *   - 导入 .txt / .lrc（识别到时间轴时给出明确反馈）
 *   - 实时显示"已识别 N 行 / 含时间轴"
 *   - 有时间轴时才显示"与音频同步"开关（避免无意义选项）
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { useUiStore } from '@/stores/useUiStore'
import { parseLrc } from '@/lib/lrc'
import type { ModuleEditorProps } from '../types'
import type { LyricsData } from './data'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()
const ui = useUiStore()

const fileInput = ref<HTMLInputElement | null>(null)

const data = computed<LyricsData>(() => {
  const raw = props.module.data as Partial<LyricsData> | undefined
  return {
    text: typeof raw?.text === 'string' ? raw.text : '',
    syncWithAudio: raw?.syncWithAudio !== false,
    maxHeight: raw?.maxHeight ?? 240,
  }
})

const parsed = computed(() => parseLrc(data.value.text))
const lineCount = computed(() => parsed.value.lines.length)

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const text = await file.text()
    if (!text.trim()) {
      ui.notify(t('lyrics.emptyFile'), 'warning')
      return
    }
    props.patchData({ text })
    const result = parseLrc(text)
    ui.notify(
      result.timed
        ? t('lyrics.importedTimed', { n: result.lines.length })
        : t('lyrics.importedPlain', { n: result.lines.length }),
      'success',
    )
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : String(error), 'danger')
  }
}
</script>

<template>
  <div class="editor">
    <textarea
      class="editor__area"
      :value="data.text"
      :readonly="readonly"
      :placeholder="t('lyrics.placeholder')"
      rows="5"
      @input="patchData({ text: ($event.target as HTMLTextAreaElement).value })"
    />

    <div class="editor__bar">
      <button class="ghost-btn" type="button" :disabled="readonly" @click="fileInput?.click()">
        <AppIcon name="import" :size="13" />
        {{ t('lyrics.importFile') }}
      </button>

      <span class="editor__stat">
        {{ t('lyrics.lineCount', { n: lineCount }) }}
        <span v-if="parsed.timed" class="editor__badge">{{ t('lyrics.timed') }}</span>
        <span v-else-if="lineCount > 0" class="editor__badge editor__badge--muted">
          {{ t('lyrics.plain') }}
        </span>
      </span>
    </div>

    <label v-if="parsed.timed" class="editor__switch">
      <input
        type="checkbox"
        :checked="data.syncWithAudio"
        :disabled="readonly"
        @change="patchData({ syncWithAudio: ($event.target as HTMLInputElement).checked })"
      />
      <span>{{ t('lyrics.syncWithAudio') }}</span>
    </label>

    <input
      ref="fileInput"
      class="u-visually-hidden"
      type="file"
      accept=".txt,.lrc,text/plain"
      @change="onFileChosen"
    />
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.editor__area {
  width: 100%;
  min-height: 110px;
  padding: var(--sp-3);
  font-size: var(--fs-sm);
  line-height: var(--lh-relaxed);
  resize: vertical;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.editor__area::placeholder {
  color: var(--text-disabled);
}

.editor__bar {
  display: flex;
  gap: var(--sp-3);
  align-items: center;
  justify-content: space-between;
}

.editor__stat {
  display: inline-flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.editor__badge {
  padding: 0 6px;
  color: var(--success);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.editor__badge--muted {
  color: var(--text-muted);
}

.editor__switch {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.ghost-btn {
  display: inline-flex;
  gap: var(--sp-1);
  align-items: center;
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

.ghost-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}
</style>
