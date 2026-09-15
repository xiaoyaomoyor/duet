/**
 * 3D 模型模块（M5）
 *
 * 用途：直接对比 Tripo3D / Meshy 这类工具产出的 .glb 模型——
 * 转起来看轮廓、看面数，比截图直观得多。
 *
 * 实现边界（写清楚，避免被误解为"完整 3D 引擎"）：
 *   只渲染静态几何。蒙皮、动画、材质贴图不支持，
 *   解析器会把不支持的特性作为 warning 返回，界面如实告知。
 */

import { defineAsyncComponent } from 'vue'
import { registerModule, type AnyModuleDefinition } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/types'
import { createMediaData, isMediaData, isMediaEmpty, type MediaData } from '../shared/mediaData'

export interface Model3dProps {
  autoRotate: boolean
  background: 'transparent' | 'void' | 'panel'
}

const definition: ModuleDefinition<MediaData, Model3dProps> = {
  type: 'model3d',
  meta: {
    titleKey: 'modules.model3d',
    icon: 'cube',
    category: 'media',
    keywords: ['3d', 'glb', 'gltf', '模型', 'tripo', 'meshy'],
  },
  schema: { create: createMediaData, isData: isMediaData },
  defaultProps: { autoRotate: true, background: 'void' },
  options: [
    { key: 'autoRotate', labelKey: 'model3d.autoRotate', type: 'boolean', default: true },
    {
      key: 'background',
      labelKey: 'model3d.background',
      type: 'select',
      values: [
        { value: 'void', labelKey: 'model3d.bgVoid' },
        { value: 'panel', labelKey: 'model3d.bgPanel' },
        { value: 'transparent', labelKey: 'model3d.bgTransparent' },
      ],
      default: 'void',
    },
  ],
  editor: defineAsyncComponent(() => import('./Model3dEditor.vue')),
  renderer: defineAsyncComponent(() => import('./Model3dRenderer.vue')),
  isEmpty: (data) => isMediaEmpty(data),
}

registerModule(definition as AnyModuleDefinition)

export default definition
