<script setup lang="ts">
/**
 * 工具图标
 *
 * 版权纪律（§10.2）：不内置任何第三方品牌 Logo。
 * 未上传图标时，用「品牌色 + 名称首字」程序化生成，风格统一且零风险。
 * 上传的自定义图标以 blob URL 渲染时同样受此规则约束——它只存在于用户本地数据中。
 */
import { computed, ref, watch } from 'vue'
import { proceduralIconDataUri } from '@/lib/icons'
import { getAsset } from '@/db/assetsRepo'

interface Props {
  name: string
  /**
   * 可选属性显式允许 undefined：
   * 模板中常写 `:color="tool.color"`，而该值可能为 undefined；
   * 在 exactOptionalPropertyTypes 下必须显式声明，否则调用处无法传值。
   */
  color?: string | undefined
  iconAssetId?: string | undefined
  size?: number | undefined
}

const props = defineProps<Props>()

/** 自定义图标的 blob URL（上传图标才有） */
const customUrl = ref<string | null>(null)

watch(
  () => props.iconAssetId,
  async (assetId, previous) => {
    if (previous && customUrl.value) {
      URL.revokeObjectURL(customUrl.value)
      customUrl.value = null
    }
    if (!assetId) return

    const asset = await getAsset(assetId)
    if (asset) customUrl.value = URL.createObjectURL(asset.blob)
  },
  { immediate: true },
)

const fallbackSrc = computed(() => {
  const options = props.color !== undefined ? { color: props.color } : {}
  return proceduralIconDataUri(props.name, options)
})

const src = computed(() => customUrl.value ?? fallbackSrc.value)
const label = computed(() => props.name)
const size = computed(() => props.size ?? 32)
</script>

<template>
  <img
    class="tool-icon"
    :src="src"
    :width="size"
    :height="size"
    :alt="label"
    :title="label"
    loading="lazy"
    draggable="false"
  />
</template>

<style scoped>
.tool-icon {
  flex: none;
  object-fit: cover;
  border-radius: 22%;
}
</style>
