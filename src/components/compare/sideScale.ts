/**
 * 工具卡片字号倍率的取值范围
 *
 * 单独放一个文件而不是塞进 SideHeader 或 SideEditorDialog：
 * 写入方（弹窗的滑块）和读取方（卡片的渲染）**必须**用同一套上下限，
 * 否则滑块能拖到 3.0、卡片却按 2.0 夹取，用户会看到"滑块动了但字不再变大"。
 * 一处定义、两处引用，这种事不该靠两个文件里各写一遍常量来维持。
 */

export const SCALE_MIN = 0.6
export const SCALE_MAX = 2
export const SCALE_STEP = 0.05

/**
 * 把任意输入夹到合法区间。
 *
 * 兜底是必要的：`nameScale` 来自项目文件，可能是手改的
 * （`1e9`、`NaN`、字符串），直接写进 CSS 会得到一个撑破版面的字号。
 *
 * 三类输入被当作"没设置过"而退回 1，而不是夹到 0.6：
 *   · null / undefined / ''  —— 字段缺失的各种常见表现
 *   · 非数值（'abc'、NaN、Infinity）—— 解析失败
 *   · 0 与负数 —— 字号倍率取非正值没有任何合理解释，
 *     它是"某个序列化器把缺省值写成了 0"，而不是用户想要 0 倍字号
 * （SCALE_MIN 保护的是"用户真的拖到了最小"这一侧。）
 */
export function clampScale(value: unknown): number {
  if (value === null || value === undefined || value === '') return 1

  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return 1

  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, n))
}
