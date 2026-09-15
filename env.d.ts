/// <reference types="vite/client" />

/**
 * 构建期环境变量（.env / .env.local）。
 * 仅 VITE_ 前缀的变量会被注入到客户端代码中。
 */
interface ImportMetaEnv {
  /** 应用访问地址，用于生成只读 HTML 导出中的回链 */
  readonly VITE_APP_BASE_URL?: string
  /** 外链媒体代理地址（仅桌面端 / 自建部署时提供；纯 Web 版留空） */
  readonly VITE_MEDIA_PROXY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/*
 * 注意：这里**故意不声明** `declare module '*.vue'`。
 * vue-tsc / Volar 能直接推断 .vue 的真实类型；一旦加上 shim，
 * 所有组件 props 都会被抹成宽泛类型（本项目已踩过这个坑：
 * ui.toasts 在模板中退化为 any，进而放过真实类型错误）。
 */

/** 静态资源导入（?raw 用于图标源码） */
declare module '*.svg?raw' {
  const content: string
  export default content
}
