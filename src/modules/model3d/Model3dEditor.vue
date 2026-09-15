<script setup lang="ts">
/**
 * 3D 模型编辑器
 *
 * 复用 MediaPicker 的"点击/拖拽/外链"三入口，只是 accept 换成 model3d，
 * 并在下方给出**实时查看器**——上传完立刻能看到模型对不对。
 */
import { computed } from 'vue'
import MediaPicker from '@/components/media/MediaPicker.vue'
import ModelViewer from '@/components/media/ModelViewer.vue'
import { useAssetBuffer } from '@/composables/useAssetBuffer'
import type { ModuleEditorProps } from '../types'
import type { MediaData } from '../shared/mediaData'

const props = defineProps<ModuleEditorProps>()

const data = computed(() => props.module.data as MediaData)
const autoRotate = computed(() => props.module.props.autoRotate !== false)

const { buffer, loading, error } = useAssetBuffer(() => data.value.assetId)
</script>

<template>
  <div class="editor">
    <MediaPicker
      accept="model3d"
      :asset-id="data.assetId"
      :source-url="data.sourceUrl"
      :name="data.name"
      :readonly="readonly"
      :preview-height="120"
      @select="
        (payload) =>
          patchData({
            assetId: payload.assetId || undefined,
            sourceUrl: payload.sourceUrl,
            name: payload.name,
          })
      "
      @clear="patchData({ assetId: undefined, sourceUrl: undefined, name: undefined })"
    />

    <div class="editor__preview">
      <ModelViewer :buffer="buffer" :auto-rotate="autoRotate" />
    </div>

    <p v-if="loading" class="editor__hint">加载模型…</p>
    <p v-else-if="error" class="editor__hint editor__hint--error">{{ error }}</p>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.editor__preview {
  margin-top: var(--sp-1);
}

.editor__hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.editor__hint--error {
  color: var(--danger);
}
</style>
