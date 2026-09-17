/**
 * 对奏 Duet — 应用级常量（产品名/版本/扩展名的唯一来源）
 *
 * 纪律（§1.3）：代码中禁止硬编码产品名，一律从此处读取。
 */

/** 从仓库地址推导出的 slug，供 localStorage key 等使用 */
const slug = 'duet'

export const APP = {
  nameZh: '对奏',
  nameEn: 'Duet',
  slug,
  /** 展示用名称：随语言切换，见 taglineZh/En */
  taglineZh: '让两个工具，同台演奏同一道题。',
  taglineEn: 'Same prompt. Two tools. One stage.',
  description: '专注内容横向对比的本地优先 Web 应用',
  version: '0.5.7',
  /** 工程文件扩展名 */
  fileExt: 'duet',
  /** 工程文件 MIME（用于分享/拖拽识别） */
  fileMime: 'application/json',
  dbName: `${slug}-db`,
  repo: 'https://github.com/xiaoyaomoyor/duet',
  license: 'AGPL-3.0-or-later',
  /** localStorage 使用的 key 前缀 */
  storagePrefix: slug,
  /** 项目列表侧栏宽度约束 */
  sidebar: { min: 200, max: 400, defaultWidth: 260 },
  /**
   * 对比配置面板宽度约束。
   * 上限比侧栏宽：配色色板与滑块并排时需要更多横向空间。
   */
  inspector: { min: 220, max: 460, defaultWidth: 280 },
} as const

/** 应用版本的展示形式 */
export function appVersionLabel(): string {
  return `v${APP.version}`
}
