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
  AlignCenter,
  AlignLeft,
  AlignRight,
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
  Ellipsis,
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
  Maximize,
  MessageSquareText,
  Mic,
  Minimize,
  Minus,
  MonitorPlay,
  Music,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
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
  SquarePen,
  Star,
  Swords,
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
  /*
   * 减号。**必须单独登记**——M9 给演示视图的缩小按钮用了 `name="minus"`，
   * 但表里只有 `divider: Minus`，于是 getIcon 返回 undefined、
   * 图标位置一片空白（用户实测："缩放的减号没有显示"）。
   * 图标名与语义名是两个命名空间，同一个 Lucide 组件可以被多个语义名引用。
   */
  minus: Minus,
  /*
   * 文本对齐（v0.5.3）。
   *
   * 这三条此前借用别的图标——左对齐与右对齐都用 `text`、居中用 `divider`，
   * 于是三个按钮里两个长得一模一样、另一个是一条横线
   * （用户实测反馈"文字模块的左对齐，居中对齐，右对齐的图标有问题"）。
   * 对齐有它自己的专用图标，没有理由借用。
   */
  alignLeft: AlignLeft,
  alignCenter: AlignCenter,
  alignRight: AlignRight,
  close: X,
  check: Check,
  search: Search,
  trash: Trash2,
  copy: Copy,
  edit: Pencil,
  more: Ellipsis,
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
  /*
   * 「对比」页面的入口图标：**versus 语义**（用户明确要求）。
   *
   * 换掉了原来的网格（LayoutGrid）——网格表达的是"排布"，不是"两方对阵"，
   * 放在这里跟旁边的设置齿轮一样抽象，扫一眼分不出这一栏是干什么的。
   * 双剑交叉是图标库里表达 versus 的通用符号，指向性比网格强得多。
   */
  versus: Swords,
  // 模块/条目的"属性/选项"。刻意与 settings（齿轮）区分开：
  // 之前两者用了同一个图标，用户反映"属性和设置长得一个样"。
  options: SlidersHorizontal,
  sidebar: PanelLeft,
  /*
   * 侧栏开 / 合各一个图标（M9 用户实测："图标在展开与折叠的状态应该不同，做出区分"）。
   * 同一个 ☰ 在两种状态下长得一模一样，用户没有任何线索知道当前是开还是合、
   * 点下去会往哪个方向变。左侧栏用 PanelLeft*、右侧的对比配置用 PanelRight*，
   * 方向与它们所在的边一致。
   */
  sidebarCollapse: PanelLeftClose,
  sidebarExpand: PanelLeftOpen,
  configCollapse: PanelRightClose,
  configExpand: PanelRightOpen,
  present: Presentation,
  lock: Lock,
  // 全屏切换：进/出用两个图标，避免"同一个图标表示相反动作"
  maximize: Maximize,
  minimize: Minimize,

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
  // "返回编辑视图"：一支笔，而不是回退箭头——它去的是"编辑"这个状态，不是一个上一页
  toEdit: SquarePen,
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
