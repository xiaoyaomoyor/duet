<script setup lang="ts">
/**
 * 媒体图片渲染（图片/封面/图片集共用）
 *
 * 四态：加载中骨架 → 就绪 → **解码失败** → 取不到资源（含原因与重试）
 * 失败必须有明确出口，绝不允许静默空白（§8.4 约束 3）。
 *
 * M8 补上"解码失败"这一态：此前只有 skeleton → ready 两态，
 * 而 mediaResolver 只要 getAsset 成功就返回 ready + blob URL，
 * **从不验证字节能不能解码**。于是一张被 ID3 去同步污染过的坏封面
 * 会渲染成破图，既不报错也不回退，用户只看到"没有封面"——
 * 分不清是文件本来就没有，还是解析坏了。
 */
import { computed, ref, watch } from 'vue'
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
    /**
     * 解码失败时**不显示错误占位**，而是整块不渲染。
     *
     * 音频模块的封面用的是它：那里已经有"音乐图标占位"这一支，
     * 再冒出一个带重试按钮的红色错误框就重复且吵闹了。
     */
    silentOnError?: boolean
  }>(),
  {
    assetId: undefined,
    sourceUrl: undefined,
    alt: '',
    fit: 'contain',
    ratio: undefined,
    rounded: true,
    silentOnError: false,
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

/** 浏览器解不开这张图（坏字节、非图片、blob 已失效） */
const decodeFailed = ref(false)

// 换资源后要重置，否则一次失败会永久卡在失败态
watch(
  () => media.src,
  () => {
    decodeFailed.value = false
  },
)

const showBroken = computed(() => decodeFailed.value && !props.silentOnError)
</script>

<template>
  <figure v-if="!(decodeFailed && silentOnError)" class="media" :style="boxStyle">
    <img
      v-if="media.src && !decodeFailed"
      class="media__img"
      :src="media.src"
      :alt="alt"
      :style="{ objectFit: fit }"
      draggable="false"
      @error="decodeFailed = true"
    />

    <div v-else-if="media.status === 'loading'" class="media__state">
      <span class="media__skeleton" aria-hidden="true" />
    </div>

    <div v-else class="media__state media__state--error">
      <AppIcon name="image" :size="18" />
      <span>{{ showBroken ? t('media.error.decode') : media.error ? t(media.error.messageKey) : t('media.error.unknown') }}</span>
      <button v-if="!showBroken" class="media__retry" type="button" @click="media.retry()">
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
