<script setup lang="ts">
/**
 * 媒体图片渲染（图片/封面/图片集共用）
 *
 * 三态：加载中骨架 → 就绪 → 失败占位（含原因与重试）
 * 失败必须有明确出口，绝不允许静默空白（§8.4 约束 3）。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/common/AppIcon.vue'
import { assetSource, useResolvedMedia } from '@/composables/useResolvedMedia'

const props = withDefaults(
  defineProps<{
    assetId?: string | undefined
    /** 外链（未镜像时使用） */
    sourceUrl?: string | undefined
    alt?: string
    /** cover 用于封面，contain 用于图片 */
    fit?: 'cover' | 'contain'
    /** 宽高比，如 '16/9'；不传则自适应 */
    ratio?: string | undefined
    rounded?: boolean
  }>(),
  {
    assetId: undefined,
    sourceUrl: undefined,
    alt: '',
    fit: 'contain',
    ratio: undefined,
    rounded: true,
  },
)

const { t } = useI18n()

const source = computed(() => {
  if (props.assetId) return assetSource(props.assetId)
  if (props.sourceUrl) return { kind: 'url' as const, url: props.sourceUrl }
  return undefined
})

const media = useResolvedMedia(source)

const boxStyle = computed(() => ({
  aspectRatio: props.ratio,
  borderRadius: props.rounded ? 'var(--radius-md)' : '0',
}))
</script>

<template>
  <figure class="media" :style="boxStyle">
    <img
      v-if="media.src"
      class="media__img"
      :src="media.src"
      :alt="alt"
      :style="{ objectFit: fit }"
      draggable="false"
    />

    <div v-else-if="media.status === 'loading'" class="media__state">
      <span class="media__skeleton" aria-hidden="true" />
    </div>

    <div v-else class="media__state media__state--error">
      <AppIcon name="image" :size="18" />
      <span>{{ media.error ? t(media.error.messageKey) : t('media.error.unknown') }}</span>
      <button class="media__retry" type="button" @click="media.retry()">
        {{ t('common.retry') }}
      </button>
    </div>
  </figure>
</template>

<style scoped>
.media {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 0;
  overflow: hidden;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-subtle);
}

.media__img {
  display: block;
  width: 100%;
  height: 100%;
}

.media__state {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  align-items: center;
  justify-content: center;
  min-height: 120px;
  padding: var(--sp-4);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.media__state--error {
  color: var(--danger);
}

.media__skeleton {
  width: 48px;
  height: 48px;
  border: 2px solid var(--border-default);
  border-top-color: var(--accent-500);
  border-radius: var(--radius-full);
  animation: media-spin 900ms linear infinite;
}

@keyframes media-spin {
  to {
    transform: rotate(360deg);
  }
}

.media__retry {
  font-size: var(--fs-xs);
  color: var(--accent-500);
}
</style>
