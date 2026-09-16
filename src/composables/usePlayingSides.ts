/**
 * 哪几侧正在播放（响应式）
 *
 * 用途：对比配置里的**聚光灯**——只有一侧在播放时，
 * 让"正在听的那一边"占更大比例（比例强调）或让另一边更低调（色彩弱化）。
 *
 * 为什么不用 useAudioClock：那个 composable 绑定组件生命周期、
 * 且必须在 setup 里调用固定次数；而这里侧的集合是动态的（未来可能 >2 侧）。
 * 所以自己管一组订阅，在侧的集合变化时重建。
 *
 * 注意：只有在音频/视频模块的"上报播放进度"开关打开时才有效
 * （那是默认值）。关掉之后聚光灯不会触发——这是开关本身的语义，
 * 不是缺陷。
 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { subscribeAudioState } from './useAudioClock'

export function usePlayingSides(sideIds: Ref<readonly string[]>): Ref<Record<string, boolean>> {
  const playing = ref<Record<string, boolean>>({})
  let unsubscribe: Array<() => void> = []

  watch(
    sideIds,
    (ids) => {
      unsubscribe.forEach((fn) => fn())
      unsubscribe = []

      // 先把这个集合重置成"都没在播"，再订阅；
      // 订阅会**同步**回调一次当前值，因此顺序反了会把刚拿到的状态覆盖掉
      const next: Record<string, boolean> = {}
      ids.forEach((id) => {
        next[id] = false
      })
      playing.value = next

      unsubscribe = ids.map((id) =>
        subscribeAudioState(id, (state) => {
          // 整对象替换而不是逐键赋值：这样依赖它的 computed 一定会重算
          playing.value = { ...playing.value, [id]: state.playing }
        }),
      )
    },
    { immediate: true },
  )

  onBeforeUnmount(() => unsubscribe.forEach((fn) => fn()))

  return playing
}
