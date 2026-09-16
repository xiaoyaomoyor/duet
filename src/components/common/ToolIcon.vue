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
 *
 * M7 修掉的一个真 bug：品牌 LOGO 改用 **CSS mask** 上色，而不是当图片铺上去。
 *   品牌 LOGO 是单色路径，而抓下来的文件填的是纯白（脚本当时特意传了 /ffffff）。
 *   白字形 + 浅色主题的浅灰底 = **完全看不见**，用户实测反馈
 *   "内置的几个 LOGO 在亮色主题下根本看不清"说的就是这个。
 *   现在把 SVG 当"形状"用（mask-image），颜色取 --text-primary，
 *   于是四个主题下都自动是"深底白字 / 浅底黑字"，再也不会消失。
 *   顺带解决了两件事：文件里的填色不再重要（重新抓取换了颜色也不会坏），
 *   以及不必再为"给图标垫一层底"而内缩。
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

/** 用户上传的图标优先于品牌 LOGO；两者都没有才走程序化图标 */
const src = computed(() => customUrl.value ?? fallbackSrc.value)
const label = computed(() => props.name)
const size = computed(() => props.size ?? 32)

/** 是否正在显示本地品牌 LOGO（决定用 mask 渲染还是 img 渲染） */
const usingBrandLogo = computed(() => brandLogo.value !== null && customUrl.value === null)

/**
 * 品牌 LOGO 的样式：把 SVG 当遮罩，用背景色填出图形。
 *
 * 同时写 `mask-*` 与 `WebkitMask*`：Safari 15.4 之前只认带前缀的那套，
 * 而 Vue 的 :style 不会自动补前缀。写两份的成本远低于"某些浏览器上图标不见了"。
 *
 * 内缩用 `mask-size: 72%` 表达，**不用 padding**：
 * 百分比 padding 解析的是**包含块**的宽度，而这个方块的包含块是整条卡片行，
 * 于是同一个 14% 在 20px 与 72px 的图标上得到完全不同的内缩
 * （上一版正是这么把 20px 的图标撑到 30px 的）。mask-size 没有这个问题。
 */
const brandStyle = computed(() => {
  const url = `url("${brandLogo.value}")`
  const px = `${size.value}px`
  return {
    width: px,
    height: px,
    maskImage: url,
    WebkitMaskImage: url,
    maskSize: '72% 72%',
    WebkitMaskSize: '72% 72%',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskPosition: 'center',
    WebkitMaskPosition: 'center',
  }
})
</script>

<template>
  <!-- 品牌 LOGO：用 mask 上色，见脚本顶部关于浅色主题的说明 -->
  <span
    v-if="usingBrandLogo"
    class="tool-icon tool-icon--brand"
    :style="brandStyle"
    role="img"
    :aria-label="label"
    :title="label"
  />

  <img
    v-else
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

/*
 * 品牌 LOGO 没有自己的底板（Simple Icons 是纯轮廓），
 * 因此用当前主题的**正文色**填出图形：深色主题下是白字形、
 * 浅色主题下是黑字形，四个主题都保证可见。
 *
 * 这里刻意不再垫一层 --bg-surface-2 的方块：
 * (1) 已经有正文色兜底，底板不再承担"让图形可见"的职责；
 * (2) 单色轮廓 + 一块实心方底，和旁边"彩色渐变小方块"的程序化图标
 *     放在一起反而更不统一。
 */
.tool-icon--brand {
  display: inline-block;
  background-color: var(--text-primary);
  border-radius: 22%;
}
</style>

