/**
 * 图标注册表（语义名 → Lucide 图标）
 *
 * 为什么要多一层间接，而不是在组件里直接 import Lucide：
 *   组件的语义是"删除"，不是"Trash2"。中间隔着这一层之后，
 *   换图标库、调整某个图标的选型，都只改本文件一处，
 *   几十个组件的模板一行都不用动。同时也让"哪些图标真的被用到"变得可枚举。
 *
 * 为什么用 `@lucide/vue` 而不是更常见的 `lucide-vue-next`：
 *   后者最新版停在 1.0.0 且已被官方标记为 deprecated
 *   （包内提示改用 `@lucide/vue`）。本项目实测确认：
 *   `lucide-vue-next` 的版本号与维护状态都已停滞，因此直接采用新包。
 *
 * 纪律：新增图标 = 在这里加一行映射。**不要**在组件里直接 import Lucide，
 * 否则这条间接层会被绕过，最终又变成"图标选型散落各处"。
 */

import {
  Activity,
  BetweenHorizontalStart,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CodeXml,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode,
  GitCompareArrows,
  GripVertical,
  HardDrive,
  Heading,
  Image,
  ImagePlay,
  Info,
  Languages,
  LayoutGrid,
  Link,
  ListOrdered,
  Lock,
  MessageSquareText,
  Mic,
  Minus,
  MonitorPlay,
  Music,
  Palette,
  PanelLeft,
  Pause,
  Pencil,
  Play,
  Plus,
  Presentation,
  Quote,
  Redo2,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  Star,
  Table,
  Tag,
  Trash2,
  Type,
  Undo2,
  Upload,
  Video,
  Wrench,
  X,
  ChartColumn,
  type LucideIcon,
} from '@lucide/vue'

export const ICONS: Record<string, LucideIcon> = {
  // —— 通用操作 ——
  plus: Plus,
  close: X,
  check: Check,
  search: Search,
  trash: Trash2,
  copy: Copy,
  edit: Pencil,
  undo: Undo2,
  redo: Redo2,
  /*
   * 导入 / 导出。
   *
   * ⚠️ M7 修正：这两个图标此前是反的（import=Upload、export=Download）。
   * 判断依据是**文件相对于应用的移动方向**，不是箭头本身的朝向：
   *   导入 = 把外面的文件拿进来 → 箭头朝下、落进托盘（Download）
   *   导出 = 把内容送出去成文件 → 箭头朝上、离开托盘（Upload）
   * 实测反馈里用户第一眼就说"这两个反了"，说明按箭头朝向硬记是行不通的。
   */
  import: Download,
  export: Upload,
  grip: GripVertical,
  // "在上方插入行"。刻意与 plus 区分：plus 是"往这一行里加模块"，
  // insertRow 是"在行与行之间插入一整行"，两者语义完全不同。
  insertRow: BetweenHorizontalStart,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,

  // —— 应用外壳 ——
  settings: Settings,
  // 模块/条目的"属性/选项"。刻意与 settings（齿轮）区分开：
  // 之前两者用了同一个图标，用户反映"属性和设置长得一个样"。
  options: SlidersHorizontal,
  sidebar: PanelLeft,
  present: Presentation,
  lock: Lock,

  // —— 媒体与模块 ——
  image: Image,
  cover: ImagePlay,
  music: Music,
  mic: Mic,
  video: Video,
  cube: Box,
  link: Link,
  iframe: MonitorPlay,
  gallery: LayoutGrid,
  eye: Eye,
  'eye-off': EyeOff,
  play: Play,
  pause: Pause,

  // —— 文本与数据 ——
  text: Type,
  comment: MessageSquareText,
  markdown: FileCode,
  richText: Heading,
  lyrics: Quote,
  code: CodeXml,
  diff: GitCompareArrows,
  divider: Minus,
  placeholder: SquareDashed,
  table: Table,
  tag: Tag,
  star: Star,
  score: ChartColumn,
  progress: Activity,
  timeline: ListOrdered,
  clock: Clock,

  // —— 设置面板分组 ——
  palette: Palette,
  languages: Languages,
  behavior: Sparkles,
  compare: LayoutGrid,
  tools: Wrench,
  storage: HardDrive,
  info: Info,
}

/** 已登记的图标名（供开发期校验与文档使用） */
export const ICON_NAMES: readonly string[] = Object.keys(ICONS).sort()

const warned = new Set<string>()

/**
 * 取图标组件；未登记时返回 undefined（由调用方决定怎么兜底）。
 * 开发期对未登记的名字告警一次——静默回退会让"图标没显示"很难被发现。
 */
export function getIcon(name: string): LucideIcon | undefined {
  const icon = ICONS[name]
  if (icon) return icon

  if (import.meta.env.DEV && !warned.has(name)) {
    warned.add(name)
    console.warn(`[duet/icons] 未登记的图标："${name}"，请在 src/data/iconMap.ts 中登记`)
  }
  return undefined
}

/** 是否已登记该图标 */
export function hasIcon(name: string): boolean {
  return name in ICONS
}
