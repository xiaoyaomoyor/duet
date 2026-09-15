<script setup lang="ts">
/**
 * 媒体选择器（模块编辑器的共用底座）
 *
 * 三条入口：
 *   1. 点击选择本地文件
 *   2. 拖拽文件到区域
 *   3. 粘贴外链 URL（可选择"仅引用不下载"）
 *
 * 空态与已选态是两套版式；导入失败会**就地显示原因**（含 CORS/防盗链提示），
 * 不会静默什么都不发生。
 *
 * 注意：useMediaPicker 的返回值在这里被**解构**——解构后 importing / maxBytes /
 * lastError 是顶层 ref 绑定，模板会自动解包；写成 `picker.importing` 则不会。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import AppPrompt from '@/components/common/AppPrompt.vue'
import { assetSource, useResolvedMedia } from '@/composables/useResolvedMedia'
import { useMediaPicker } from '@/composables/useMediaPicker'
import { useUiStore } from '@/stores/useUiStore'
import type { AssetKind } from '@/types/project'

interface Props {
  /** 期望的媒体种类 */
  accept: Extract<AssetKind, 'image' | 'audio' | 'video' | 'model3d'>
  /** 已选资源的 id（本地） */
  assetId?: string | undefined
  /** 已选外链（未镜像时使用） */
  sourceUrl?: string | undefined
  /** 已选资源的展示名 */
  name?: string | undefined
  /** 预览区高度 */
  previewHeight?: number
  readonly?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  select: [
    payload: {
      assetId: string
      name: string
      sourceUrl?: string
      kind: AssetKind
    },
  ]
  clear: []
}>()

const { t } = useI18n()
const ui = useUiStore()
const { importing, maxBytes, lastError, pickFile, pickUrl } = useMediaPicker({
  accept: props.accept,
})

const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const urlPromptOpen = ref(false)

/** 已选媒体的预览来源：本地优先，其次外链 */
const previewSource = computed(() => {
  if (props.assetId) return assetSource(props.assetId)
  if (props.sourceUrl) return { kind: 'url' as const, url: props.sourceUrl }
  return undefined
})

const media = useResolvedMedia(previewSource)

const hasMedia = computed(() => Boolean(props.assetId || props.sourceUrl))
const previewHeight = computed(() => props.previewHeight ?? 160)

const acceptAttr = computed(() => {
  switch (props.accept) {
    case 'image':
      return 'image/*'
    case 'audio':
      return 'audio/*'
    case 'video':
      return 'video/*'
    default:
      return '.glb,.gltf'
  }
})

const acceptIcon = computed(() => {
  switch (props.accept) {
    case 'audio':
      return 'music'
    case 'video':
      return 'video'
    case 'model3d':
      return 'cube'
    default:
      return 'image'
  }
})

function openFileDialog(): void {
  if (props.readonly) return
  input.value?.click()
}

async function onFilesChosen(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  target.value = ''
  const file = files[0]
  if (!file) return
  await importFile(file)
}

async function importFile(file: File): Promise<void> {
  const result = await pickFile(file)
  if (!result.ok) {
    ui.notify(result.error, 'danger')
    return
  }
  emit('select', {
    assetId: result.value.assetId,
    name: result.value.name,
    kind: result.value.kind,
  })
}

async function onDrop(event: DragEvent): Promise<void> {
  dragging.value = false
  if (props.readonly) return
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  await importFile(file)
}

async function onUrlConfirm(url: string, linkOnly: boolean): Promise<void> {
  urlPromptOpen.value = false
  const result = await pickUrl(url, { linkOnly })
  if (!result.ok) {
    ui.notify(result.error, 'danger')
    return
  }

  const payload: { assetId: string; name: string; sourceUrl?: string; kind: AssetKind } = {
    assetId: result.value.assetId,
    name: result.value.name,
    kind: result.value.kind,
  }
  if (result.value.sourceUrl) payload.sourceUrl = result.value.sourceUrl
  emit('select', payload)
}

function clear(): void {
  emit('clear')
}
</script>

<template>
  <div class="picker">
    <!-- 已选：预览 + 操作 -->
    <template v-if="hasMedia">
      <div class="preview" :style="{ height: `${previewHeight}px` }">
        <img
          v-if="accept === 'image' && media.src"
          class="preview__img"
          :src="media.src"
          :alt="name ?? ''"
        />
        <video
          v-else-if="accept === 'video' && media.src"
          class="preview__img"
          :src="media.src"
          controls
          preload="metadata"
        />
        <audio
          v-else-if="accept === 'audio' && media.src"
          class="preview__audio"
          :src="media.src"
          controls
          preload="metadata"
        />
        <div v-else-if="media.status === 'loading'" class="preview__state">
          {{ t('common.loading') }}
        </div>
        <div v-else class="preview__state preview__state--error">
          <AppIcon :name="acceptIcon" :size="20" />
          <span>{{ media.error ? t(media.error.messageKey) : t('media.error.unknown') }}</span>
          <button class="link-btn" type="button" @click="media.retry()">
            {{ t('common.retry') }}
          </button>
        </div>
      </div>

      <div class="meta">
        <span class="meta__name u-truncate">{{ name ?? t('media.untitled') }}</span>
        <span v-if="sourceUrl && !assetId" class="meta__badge" :title="t('media.linkOnlyHint')">
          {{ t('media.linkOnly') }}
        </span>
      </div>

      <div v-if="!readonly" class="actions">
        <button class="ghost-btn" type="button" @click="openFileDialog">
          <AppIcon name="import" :size="13" />
          {{ t('media.replace') }}
        </button>
        <button class="ghost-btn" type="button" @click="urlPromptOpen = true">
          <AppIcon name="link" :size="13" />
          {{ t('media.fromUrl') }}
        </button>
        <button class="ghost-btn ghost-btn--danger" type="button" @click="clear">
          <AppIcon name="close" :size="13" />
          {{ t('media.remove') }}
        </button>
      </div>
    </template>

    <!-- 未选：拖拽区 -->
    <template v-else>
      <button
        class="dropzone"
        type="button"
        :class="{ 'dropzone--dragging': dragging, 'dropzone--busy': importing }"
        :disabled="readonly || importing"
        :style="{ minHeight: `${previewHeight}px` }"
        @click="openFileDialog"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <AppIcon :name="acceptIcon" :size="22" />
        <span class="dropzone__title">
          {{ importing ? t('media.importing') : t('media.dropHint') }}
        </span>
        <span class="dropzone__hint">
          {{ t('media.sizeLimit', { size: `${Math.round(maxBytes / 1024 / 1024)}MB` }) }}
        </span>
      </button>

      <div v-if="!readonly" class="actions">
        <button class="ghost-btn" type="button" @click="urlPromptOpen = true">
          <AppIcon name="link" :size="13" />
          {{ t('media.fromUrl') }}
        </button>
      </div>
    </template>

    <p v-if="lastError" class="error">
      <AppIcon name="comment" :size="13" />
      {{ lastError }}
    </p>

    <input
      ref="input"
      class="u-visually-hidden"
      type="file"
      :accept="acceptAttr"
      @change="onFilesChosen"
    />

    <AppPrompt
      :open="urlPromptOpen"
      :title="t('media.fromUrl')"
      :label="t('media.urlLabel')"
      :placeholder="t('media.urlPlaceholder')"
      :confirm-label="t('media.import')"
      :checkbox-label="t('media.linkOnlyOption')"
      @confirm="onUrlConfirm"
      @cancel="urlPromptOpen = false"
    />
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.preview {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.preview__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preview__audio {
  width: 100%;
  padding: 0 var(--sp-3);
}

.preview__state {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.preview__state--error {
  color: var(--danger);
}

.meta {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.meta__name {
  min-width: 0;
}

.meta__badge {
  flex: none;
  padding: 0 6px;
  color: var(--warning);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.dropzone {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--sp-4);
  color: var(--text-muted);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  transition:
    border-color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}

.dropzone:hover:not(:disabled) {
  color: var(--text-secondary);
  background: var(--bg-hover);
}

.dropzone--dragging {
  background: var(--accent-soft);
  border-color: var(--accent-500);
}

.dropzone__title {
  font-size: var(--fs-sm);
}

.dropzone__hint {
  font-size: var(--fs-xs);
  color: var(--text-disabled);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
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

.ghost-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.ghost-btn--danger:hover {
  color: var(--danger);
  border-color: var(--danger);
}

.link-btn {
  font-size: var(--fs-xs);
  color: var(--accent-500);
}

.error {
  display: flex;
  gap: var(--sp-2);
  align-items: flex-start;
  font-size: var(--fs-xs);
  color: var(--danger);
}
</style>
