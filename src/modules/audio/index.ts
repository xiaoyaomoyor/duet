/**
 * 音频模块
 *
 * 与 M4 的边界（重要）：
 *   M2 提供"可播放 + 上报播放时间"的独立播放器（原生控件），
 *   同一对比方的歌词/进度条据此联动。
 *   M4 再把它升级为**双轨同步播放**（共享 AudioContext 时钟、漂移校正、Solo/Mute）。
 *   届时本模块对外行为不变，只是接入 audioSyncService。
 *
 * 类型定义在 ./data.ts —— 见 text/data.ts 顶部关于循环依赖的说明。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createMediaData, isMediaData, isMediaEmpty, type MediaData } from '../shared/mediaData'
import type { AudioProps } from './data'

const definition: ModuleDefinition<MediaData, AudioProps> = {
  type: 'audio',
  meta: {
    titleKey: 'modules.audio',
    icon: 'music',
    category: 'media',
    keywords: ['audio', '音频', '音乐', 'mp3', 'wav', 'song'],
  },
  schema: { create: createMediaData, isData: isMediaData },
  defaultProps: {
    showWaveform: true,
    reportClock: true,
    showCover: true,
    showPlayer: true,
    layout: 'bar',
  } satisfies AudioProps,
  options: [
    { key: 'showWaveform', labelKey: 'moduleOption.showWaveform', type: 'boolean', default: true },
    { key: 'reportClock', labelKey: 'moduleOption.reportClock', type: 'boolean', default: true },
    { key: 'showCover', labelKey: 'moduleOption.showCover', type: 'boolean', default: true },
    { key: 'showPlayer', labelKey: 'moduleOption.showPlayer', type: 'boolean', default: true },
    {
      key: 'layout',
      labelKey: 'moduleOption.audioLayout',
      type: 'select',
      default: 'bar',
      values: [
        { value: 'bar', labelKey: 'moduleOption.audioLayoutBar' },
        { value: 'square', labelKey: 'moduleOption.audioLayoutSquare' },
      ],
    },
  ],
  editor: defineAsyncComponent(() => import('./AudioEditor.vue')),
  renderer: defineAsyncComponent(() => import('./AudioRenderer.vue')),
  isEmpty: (data) => isMediaEmpty(data),
}

registerModule(definition as AnyModuleDefinition)

export default definition
