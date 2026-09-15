<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import MediaImage from '@/components/media/MediaImage.vue'
import { useMediaPicker } from '@/composables/useMediaPicker'
import { useUiStore } from '@/stores/useUiStore'
import type { ModuleEditorProps } from '../types'
import type { GalleryData, GalleryItem } from './data'

const props = defineProps<ModuleEditorProps>()

const { t } = useI18n()
const ui = useUiStore()
const picker = useMediaPicker({ accept: 'image' })

const fileInput = ref<HTMLInputElement | null>(null)

const data = computed<GalleryData>(() => {
  const raw = props.module.data as Partial<GalleryData> | undefined
  return {
    items: Array.isArray(raw?.items) ? raw.items : [],
    columns: raw?.columns === 3 || raw?.columns === 4 ? raw.columns : 2,
  }
})

function write(items: GalleryItem[]): void {
  props.patchData({ items })
}

async function onFilesChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return

  const results = await picker.pickFiles(files)
  const next: GalleryItem[] = [...data.value.items]
  let failed = 0

  for (const result of results) {
    if (result.ok) {
      next.push({ assetId: result.value.assetId, name: result.value.name })
    } else {
      failed += 1
    }
  }

  write(next)
  if (failed > 0) ui.notify(t('gallery.partialFailed', { n: failed }), 'warning')
}

function removeAt(index: number): void {
  write(data.value.items.filter((_, i) => i !== index))
}

/** 上/下移：比拖拽更可靠，且天然支持键盘操作 */
function move(index: number, delta: number): void {
  const target = index + delta
  const items = [...data.value.items]
  if (target < 0 || target >= items.length) return
  const [item] = items.splice(index, 1)
  if (!item) return
  items.splice(target, 0, item)
  write(items)
}

function setColumns(value: number): void {
  props.patchData({ columns: value === 3 || value === 4 ? value : 2 })
}
</script>

<template>
  <div class="editor">
    <div class="editor__grid" :style="{ gridTemplateColumns: `repeat(${data.columns}, 1fr)` }">
      <div v-for="(item, index) in data.items" :key="index" class="tile">
        <MediaImage
          :asset-id="item.assetId"
          :source-url="item.sourceUrl"
          :alt="item.name ?? ''"
          fit="cover"
          ratio="1/1"
        />
        <div v-if="!readonly" class="tile__bar">
          <button
            class="tile__btn"
            type="button"
            :disabled="index === 0"
            :title="t('gallery.moveUp')"
            :aria-label="t('gallery.moveUp')"
            @click="move(index, -1)"
          >
            <AppIcon name="chevron-left" :size="12" />
          </button>
          <button
            class="tile__btn"
            type="button"
            :disabled="index === data.items.length - 1"
            :title="t('gallery.moveDown')"
            :aria-label="t('gallery.moveDown')"
            @click="move(index, 1)"
          >
            <AppIcon name="chevron-right" :size="12" />
          </button>
          <button
            class="tile__btn tile__btn--danger"
            type="button"
            :title="t('common.remove')"
            :aria-label="t('common.remove')"
            @click="removeAt(index)"
          >
            <AppIcon name="close" :size="12" />
          </button>
        </div>
      </div>
    </div>

    <div class="editor__bar">
      <button class="ghost-btn" type="button" :disabled="readonly" @click="fileInput?.click()">
        <AppIcon name="plus" :size="13" />
        {{ picker.importing.value ? t('media.importing') : t('gallery.addImages') }}
      </button>

      <div class="editor__columns" role="group" :aria-label="t('gallery.columns')">
        <button
          v-for="value in [2, 3, 4]"
          :key="value"
          class="editor__column-btn"
          type="button"
          :class="{ 'editor__column-btn--active': data.columns === value }"
          :aria-pressed="data.columns === value"
          @click="setColumns(value)"
        >
          {{ value }}
        </button>
      </div>
    </div>

    <input
      ref="fileInput"
      class="u-visually-hidden"
      type="file"
      accept="image/*"
      multiple
      @change="onFilesChosen"
    />
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.editor__grid {
  display: grid;
  gap: var(--sp-2);
}

.tile {
  position: relative;
}

.tile__bar {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
  margin-top: 2px;
}

.tile__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 18px;
  color: var(--text-muted);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xs);
}

.tile__btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.tile__btn--danger:hover:not(:disabled) {
  color: var(--danger);
}

.editor__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.editor__columns {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
}

.editor__column-btn {
  width: 22px;
  height: 20px;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  border-radius: var(--radius-xs);
}

.editor__column-btn--active {
  color: var(--text-primary);
  background: var(--accent-soft);
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
