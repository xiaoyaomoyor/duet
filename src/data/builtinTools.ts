/**
 * 内置工具库（§10.1）
 *
 * 纪律：
 *   1. 内置工具**不落库**（随版本更新，避免与用户自建库冲突）；
 *      用户对内置工具做的"停用"以 settings.disabledBuiltinTools 记录。
 *   2. **不内置任何第三方品牌 Logo**（版权风险，§10.2）。
 *      图标一律由「品牌色 + 名称首字」程序化生成。
 *   3. 新增工具 = 在此追加一行，无需改动任何其他代码。
 */

import type { Tool, ToolCategory } from '@/types'

export interface BuiltinToolSeed {
  /** 稳定键，用于版本升级时与用户数据对齐 */
  key: string
  name: string
  vendor: string
  category: ToolCategory
  color: string
  aliases: string[]
  homepage?: string
}

export const BUILTIN_TOOL_SEEDS: readonly BuiltinToolSeed[] = [
  // ——————————————————————— 音乐生成 ———————————————————————
  { key: 'suno', name: 'Suno', vendor: 'Suno AI', category: 'music', color: '#a78bfa', aliases: ['suno ai', '苏诺'], homepage: 'https://suno.com' },
  { key: 'udio', name: 'Udio', vendor: 'Udio', category: 'music', color: '#c084fc', aliases: ['udio ai'], homepage: 'https://udio.com' },
  { key: 'lyria', name: 'Lyria', vendor: 'Google', category: 'music', color: '#60a5fa', aliases: ['google music', 'musiclm', 'lyria 2'], homepage: 'https://deepmind.google/technologies/lyria/' },
  { key: 'riffusion', name: 'Riffusion', vendor: 'Riffusion', category: 'music', color: '#34d399', aliases: ['riffusion ai'], homepage: 'https://riffusion.com' },
  { key: 'haimian', name: '海绵音乐', vendor: '字节跳动', category: 'music', color: '#22d3ee', aliases: ['haimian', '海绵'], homepage: 'https://www.haimian.com' },
  { key: 'skymusic', name: '天工 SkyMusic', vendor: '昆仑万维', category: 'music', color: '#38bdf8', aliases: ['skywork', 'skymusic', '天工'] },

  // ——————————————————————— 图像生成 ———————————————————————
  { key: 'midjourney', name: 'Midjourney', vendor: 'Midjourney', category: 'image', color: '#f472b6', aliases: ['mj', 'midjourney v6'], homepage: 'https://midjourney.com' },
  { key: 'stable-diffusion', name: 'Stable Diffusion', vendor: 'Stability AI', category: 'image', color: '#fb923c', aliases: ['sd', 'sdxl', 'sd3', 'stable diffusion'], homepage: 'https://stability.ai' },
  { key: 'flux', name: 'FLUX', vendor: 'Black Forest Labs', category: 'image', color: '#fbbf24', aliases: ['flux1', 'flux pro'], homepage: 'https://blackforestlabs.ai' },
  { key: 'dalle', name: 'DALL·E', vendor: 'OpenAI', category: 'image', color: '#34d399', aliases: ['dalle', 'dall-e 3'], homepage: 'https://openai.com/dall-e-3' },
  { key: 'jimeng-image', name: '即梦', vendor: '字节跳动', category: 'image', color: '#22d3ee', aliases: ['dreamina', '即梦 ai'], homepage: 'https://jimeng.jianying.com' },
  { key: 'tongyi-wanxiang', name: '通义万相', vendor: '阿里巴巴', category: 'image', color: '#c084fc', aliases: ['wanx', '通义'] },
  { key: 'ideogram', name: 'Ideogram', vendor: 'Ideogram', category: 'image', color: '#f87171', aliases: ['ideogram ai'], homepage: 'https://ideogram.ai' },

  // ——————————————————————— 视频生成 ———————————————————————
  { key: 'kling', name: '可灵', vendor: '快手', category: 'video', color: '#f472b6', aliases: ['kling', 'klingai', '可灵 ai'], homepage: 'https://klingai.kuaishou.com' },
  { key: 'jimeng-video', name: '即梦', vendor: '字节跳动', category: 'video', color: '#22d3ee', aliases: ['dreamina', '即梦视频'], homepage: 'https://jimeng.jianying.com' },
  { key: 'runway', name: 'Runway', vendor: 'Runway', category: 'video', color: '#a78bfa', aliases: ['gen-3', 'runwayml'], homepage: 'https://runwayml.com' },
  { key: 'pika', name: 'Pika', vendor: 'Pika Labs', category: 'video', color: '#fb923c', aliases: ['pika labs'], homepage: 'https://pika.art' },
  { key: 'luma', name: 'Luma', vendor: 'Luma AI', category: 'video', color: '#60a5fa', aliases: ['dream machine', 'lumalabs'], homepage: 'https://lumalabs.ai' },
  { key: 'sora', name: 'Sora', vendor: 'OpenAI', category: 'video', color: '#34d399', aliases: ['openai sora'], homepage: 'https://openai.com/sora' },
  { key: 'vidu', name: 'Vidu', vendor: '生数科技', category: 'video', color: '#38bdf8', aliases: ['vidu ai'] },
  { key: 'hailuo', name: '海螺', vendor: 'MiniMax', category: 'video', color: '#fbbf24', aliases: ['hailuo ai', '海螺 ai'], homepage: 'https://hailuoai.com' },

  // ——————————————————————— 语音合成 ———————————————————————
  { key: 'indextts', name: 'IndexTTS', vendor: '哔哩哔哩', category: 'audio-tts', color: '#f472b6', aliases: ['index tts', 'indextts2'] },
  { key: 'gpt-sovits', name: 'GPT-SoVITS', vendor: '开源社区', category: 'audio-tts', color: '#a78bfa', aliases: ['sovits', 'gpt sovits'] },
  { key: 'cosyvoice', name: 'CosyVoice', vendor: '阿里巴巴', category: 'audio-tts', color: '#22d3ee', aliases: ['cosyvoice2'] },
  { key: 'fish-audio', name: 'Fish Audio', vendor: 'Fish Audio', category: 'audio-tts', color: '#34d399', aliases: ['fish speech'], homepage: 'https://fish.audio' },
  { key: 'elevenlabs', name: 'ElevenLabs', vendor: 'ElevenLabs', category: 'audio-tts', color: '#60a5fa', aliases: ['11labs', 'eleven labs'], homepage: 'https://elevenlabs.io' },
  { key: 'minimax-speech', name: 'MiniMax Speech', vendor: 'MiniMax', category: 'audio-tts', color: '#fb923c', aliases: ['minimax tts'] },

  // ——————————————————————— 3D 生成 ———————————————————————
  { key: 'tripo3d', name: 'Tripo3D', vendor: 'VAST', category: 'model-3d', color: '#a78bfa', aliases: ['tripo', 'tripo ai'], homepage: 'https://tripo3d.ai' },
  { key: 'meshy', name: 'Meshy', vendor: 'Meshy', category: 'model-3d', color: '#22d3ee', aliases: ['meshy ai'], homepage: 'https://meshy.ai' },
  { key: 'rodin', name: 'Rodin', vendor: 'Deemos', category: 'model-3d', color: '#f472b6', aliases: ['hyper3d rodin'] },
  { key: 'hyper3d', name: 'Hyper3D', vendor: 'Deemos', category: 'model-3d', color: '#c084fc', aliases: ['hyper 3d'] },
  { key: 'luma-genie', name: 'Luma Genie', vendor: 'Luma AI', category: 'model-3d', color: '#60a5fa', aliases: ['genie'] },

  // ——————————————————————— 大模型 ———————————————————————
  { key: 'deepseek', name: 'DeepSeek', vendor: '深度求索', category: 'llm', color: '#60a5fa', aliases: ['deepseek v3', 'deepseek r1', '深度求索'], homepage: 'https://deepseek.com' },
  { key: 'glm', name: 'GLM', vendor: '智谱 AI', category: 'llm', color: '#38bdf8', aliases: ['chatglm', 'glm-4', '智谱'], homepage: 'https://zhipuai.cn' },
  { key: 'qwen', name: 'Qwen', vendor: '阿里巴巴', category: 'llm', color: '#c084fc', aliases: ['通义千问', 'qwen2.5'], homepage: 'https://tongyi.aliyun.com' },
  { key: 'kimi', name: 'Kimi', vendor: '月之暗面', category: 'llm', color: '#a78bfa', aliases: ['moonshot', '月之暗面'], homepage: 'https://kimi.moonshot.cn' },
  { key: 'claude', name: 'Claude', vendor: 'Anthropic', category: 'llm', color: '#fb923c', aliases: ['claude 3.5', 'sonnet', 'opus'], homepage: 'https://claude.ai' },
  { key: 'gpt', name: 'GPT', vendor: 'OpenAI', category: 'llm', color: '#34d399', aliases: ['chatgpt', 'gpt-4', 'gpt-4o'], homepage: 'https://openai.com' },
  { key: 'gemini', name: 'Gemini', vendor: 'Google', category: 'llm', color: '#fbbf24', aliases: ['bard', 'gemini pro'], homepage: 'https://deepmind.google/technologies/gemini/' },

  // ——————————————————————— 代码 / 建站 ———————————————————————
  { key: 'cursor', name: 'Cursor', vendor: 'Anysphere', category: 'code', color: '#a78bfa', aliases: ['cursor ai'], homepage: 'https://cursor.com' },
  { key: 'claude-code', name: 'Claude Code', vendor: 'Anthropic', category: 'code', color: '#fb923c', aliases: ['claude code cli'] },
  { key: 'v0', name: 'v0', vendor: 'Vercel', category: 'code', color: '#c084fc', aliases: ['v0 dev'], homepage: 'https://v0.dev' },
  { key: 'bolt', name: 'Bolt', vendor: 'StackBlitz', category: 'code', color: '#38bdf8', aliases: ['bolt new'], homepage: 'https://bolt.new' },
  { key: 'lovable', name: 'Lovable', vendor: 'Lovable', category: 'code', color: '#f472b6', aliases: ['gpt engineer'], homepage: 'https://lovable.dev' },

  // ——————————————————————— 通用占位（对比任意事物） ———————————————————————
  { key: 'product-a', name: '产品 A', vendor: '', category: 'product', color: '#a78bfa', aliases: ['product a', '方案一', '甲'] },
  { key: 'product-b', name: '产品 B', vendor: '', category: 'product', color: '#22d3ee', aliases: ['product b', '方案二', '乙'] },
  { key: 'game-a', name: '游戏 A', vendor: '', category: 'game', color: '#f472b6', aliases: ['game a'] },
  { key: 'game-b', name: '游戏 B', vendor: '', category: 'game', color: '#34d399', aliases: ['game b'] },
]

/** 分类的展示顺序与 i18n key */
export const TOOL_CATEGORIES: ReadonlyArray<{ id: ToolCategory; labelKey: string }> = [
  { id: 'music', labelKey: 'tools.category.music' },
  { id: 'image', labelKey: 'tools.category.image' },
  { id: 'video', labelKey: 'tools.category.video' },
  { id: 'audio-tts', labelKey: 'tools.category.audioTts' },
  { id: 'model-3d', labelKey: 'tools.category.model3d' },
  { id: 'llm', labelKey: 'tools.category.llm' },
  { id: 'code', labelKey: 'tools.category.code' },
  { id: 'product', labelKey: 'tools.category.product' },
  { id: 'game', labelKey: 'tools.category.game' },
  { id: 'other', labelKey: 'tools.category.other' },
]

const CATEGORY_LABEL = new Map(TOOL_CATEGORIES.map((item) => [item.id, item.labelKey]))

export function toolCategoryLabelKey(category: ToolCategory): string {
  return CATEGORY_LABEL.get(category) ?? 'tools.category.other'
}

/**
 * 运行时工具：在内置工具的基础上附上"是否被用户停用"。
 * 停用状态来自 settings.disabledBuiltinTools，**不改动工具本身**。
 */
export interface ResolvedTool extends Tool {
  disabled: boolean
}

/**
 * 把内置种子物化为运行时工具对象。
 *
 * id 使用稳定键（`builtin:<key>`），保证工程文件里的引用在应用版本升级后依然有效。
 */
export function resolveBuiltinTools(disabledKeys: readonly string[] = []): ResolvedTool[] {
  const disabled = new Set(disabledKeys)
  return BUILTIN_TOOL_SEEDS.map((seed) => {
    const tool: ResolvedTool = {
      id: `builtin:${seed.key}`,
      kind: 'builtin',
      name: seed.name,
      vendor: seed.vendor,
      category: seed.category,
      color: seed.color,
      aliases: seed.aliases,
      builtinKey: seed.key,
      createdAt: 0,
      disabled: disabled.has(seed.key),
    }
    if (seed.homepage !== undefined) tool.homepage = seed.homepage
    return tool
  })
}

/** 内置工具总数（供设置页展示） */
export const BUILTIN_TOOL_COUNT = BUILTIN_TOOL_SEEDS.length
