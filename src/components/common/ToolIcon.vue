<script setup lang="ts">
/**
 * 工具图标
 *
 * 三级回退（从优先到兜底）：
 *   1. **本地品牌 LOGO**——只有跑过 `npm run logos` 的机器才有
 *      （目录在 .gitignore 里，第三方商标不入库，见 lib/localLogos.ts）
 *   2. 用户上传的自定义图标（存在本机 IndexedDB 里）
 *   3. 程序化生成：品牌色 + 名称首字，风格统一且零版权风险
 *
 * 版权纪律（§10.2）：仓库内**不内置任何第三方品牌 Logo**。
 * 第 1 级是用户自己在本机拉取的，第 2 级是用户自己上传的，
 * 两者都不随仓库分发。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { proceduralIconDataUri } from '@/lib/icons'
import { getAsset } from '@/db/assetsRepo'
import { loadLocalLogos, localLogoUrl } from '@/lib/localLogos'

interface Props {
  name: string
  /**
   * 可选属性显式允许 undefined：
   * 模板中常写 `:color="tool.color"`，而该值可能为 undefined；
   * 在 exactOptionalPropertyTypes 下必须显式声明，否则调用处无法传值。
   */
  color?: string | undefined
  iconAssetId?: string | undefined
  /** 本地 LOGO 的查表键（内置工具用 builtinKey，自定义工具用 id） */
  logoKey?: string | undefined
  size?: number | undefined
}

const props = defineProps<Props>()

/** 自定义图标的 blob URL（上传图标才有） */
const customUrl = ref<string | null>(null)
/** 本地品牌 LOGO 是否就绪（清单读完前先按程序化图标渲染，避免闪烁） */
const logosReady = ref(false)

onMounted(async () => {
  await loadLocalLogos()
  logosReady.value = true
})

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

/** 本地品牌 LOGO 的地址；没有则 null */
const brandLogo = computed(() => (logosReady.value ? localLogoUrl(props.logoKey) : null))

const src = computed(() => customUrl.value ?? brandLogo.value ?? fallbackSrc.value)
const label = computed(() => props.name)
const size = computed(() => props.size ?? 32)

/** 是否正在显示本地品牌 LOGO（用于切换样式与内缩） */
const usingBrandLogo = computed(() => brandLogo.value !== null && customUrl.value === null)

/**
 * 品牌 LOGO 的内缩量（px）。
 *
 * 刻意用**计算出的像素值**而不是百分比 padding：
 * 百分比 padding 解析的是**包含块的宽度**（这里是整条 chip），而不是图标自身，
 * 所以同一个 16% 在 20px 与 72px 的图标上得到的内缩完全不同——
 * 实测它把 20px 的图标撑到了 30px，把旁边的工具名挤成了省略号。
 * 按 size 直接算就没有这种不确定性。
 */
const brandInset = computed(() => Math.round(size.value * 0.16))
</script>

<template>
  <img
    class="tool-icon"
    :class="{ 'tool-icon--brand': usingBrandLogo }"
    :style="usingBrandLogo ? { padding: `${brandInset}px` } : undefined"
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

/*
 * 品牌 LOGO 是单色路径、没有底板，直接铺满会显得又平又小。
 * 给一层浅底 + 内缩（内缩量在 JS 里按 size 算，见 brandInset），
 * 让它在与程序化图标并排时不显得突兀。
 */
.tool-icon--brand {
  box-sizing: border-box;
  background: var(--bg-surface-2);
  object-fit: contain;
}
</style>
