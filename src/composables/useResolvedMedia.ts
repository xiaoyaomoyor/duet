/**
 * 媒体解析的组合式封装
 *
 * 组件侧只需：
 *   const media = useResolvedMedia(() => assetSource(data.assetId))
 * 即可拿到可直接放进 <img src> 的地址。
 *
 * 返回 **reactive 对象**：模板里可直接写 `media.src`，无需 `.value`。
 *
 * 两条必须遵守的约束（都是踩过的坑）：
 *
 * 1. watch 比较的是 **sourceKey 字符串**，不是 source 对象。
 *    调用方常写 `computed(() => ({ kind: 'asset', assetId: props.assetId }))`，
 *    每次求值都是新对象；按身份比较会让 watch 被自身触发形成死循环，
 *    每次解析都被下一次打断，预览永远加载不出来。
 *
 * 2. blob URL 的释放交给 services/mediaResolver 统一管理，这里**不做 release**。
 *    早期版本用引用计数逐个释放，会提前撤销仍在使用的 URL，
 *    表现为"上传成功但预览始终加载失败"。
 */

import { onUnmounted, reactive, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { resolveMedia, peekMedia, type MediaError } from '@/services/mediaResolver'
import type { MediaSource } from '@/types/project'

const pendingResolutions = new Set<Promise<void>>()

/** 导出须等 IndexedDB 媒体解析完成，不能只等待固定帧数。 */
export async function waitForMediaResolutions(): Promise<void> {
  while (pendingResolutions.size) await Promise.all([...pendingResolutions])
}

export interface ResolvedMedia {
  /** 可直接放进 <img src> / <audio src>；未就绪时为 null */
  src: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: MediaError | undefined
  /** 手动重试（对应错误占位上的"重新加载"按钮） */
  retry: () => void
}

/** 媒体来源的稳定键：用于 watch 比较 */
export function sourceKey(source: MediaSource | undefined): string {
  if (!source) return ''
  return source.kind === 'asset' ? `a:${source.assetId}` : `u:${source.url}`
}

/**
 * @param source 取值函数：返回 undefined 表示"未选择媒体"，不触发解析
 */
export function useResolvedMedia(
  source: MaybeRefOrGetter<MediaSource | undefined>,
  options: { warmStart?: boolean } = {},
): ResolvedMedia {
  const state = reactive<Omit<ResolvedMedia, 'retry'>>({
    src: null,
    status: 'idle',
    error: undefined,
  })

  let token = 0
  const retryTick = shallowRef(0)

  async function run(): Promise<void> {
    const currentToken = ++token
    const current = toValue(source)

    if (!current) {
      state.src = null
      state.status = 'idle'
      state.error = undefined
      return
    }

    // Warm scenes render with their final media on the first Vue pass. Avoid an empty-cover
    // render followed by another layout just to await an already cached URL.
    // Opt in for stage-owned tracks. Legacy synchronized players retain their asynchronous
    // registration order while edit/present renderers hand over the same side's clock.
    const ready = options.warmStart
      ? current.kind === 'url'
        ? current.url
        : peekMedia(current.assetId)
      : null
    if (ready) {
      state.src = ready
      state.status = 'ready'
      state.error = undefined
      return
    }

    state.status = 'loading'
    state.error = undefined

    const resolved = await resolveMedia(current)
    // 竞态保护：解析期间来源又变了，丢弃本次结果
    if (currentToken !== token) return

    state.src = resolved.src
    state.status = resolved.status
    state.error = resolved.error
  }

  watch(
    () => `${sourceKey(toValue(source))}#${retryTick.value}`,
    () => {
      const task = run()
      pendingResolutions.add(task)
      const finish = (): void => {
        pendingResolutions.delete(task)
      }
      void task.then(finish, finish)
    },
    { immediate: true },
  )

  onUnmounted(() => {
    // 只作废 token；缓存里的 blob URL 由 mediaResolver 统一回收
    token += 1
  })

  return Object.assign(state, {
    retry: () => {
      retryTick.value += 1
    },
  }) as ResolvedMedia
}

/** 把可能为空的 assetId 转成 MediaSource（渲染器与编辑器共用） */
export function assetSource(assetId: string | undefined | null): MediaSource | undefined {
  return assetId ? { kind: 'asset', assetId } : undefined
}
