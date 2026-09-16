/**
 * 导入 .duet 工程文件
 *
 * 从 TopBar 抽出来的：M7 把导入从顶栏挪到了对比页工具条，
 * 同时在"从一次对比开始"空状态里也放了一个入口（那个页面本来就没有工具条）。
 * 两处入口共用同一段逻辑，抽出来是必然的——复制一遍迟早会漏改其中一处。
 *
 * 为什么必须走 exportService.importDuet：
 *   导入不是"读一个 JSON"那么简单。它要先落媒体（内容哈希去重）、
 *   再落项目，并返回缺失媒体与警告。自己写一遍解析会静默丢掉这些信息。
 *
 * 为什么用**函数式模板 ref**（`:ref="setInput"`）而不是 `ref="fileInput"`：
 *   后者要求组件里声明一个只被模板引用的变量，而 `noUnusedLocals` 看不见
 *   模板里的字符串 ref，会直接报"声明未使用"。函数式 ref 是显式使用，
 *   顺带把元素类型收窄到 HTMLInputElement，省掉一次 as 断言。
 */
import { ref, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { importDuet } from '@/services/exportService'
import { persistProject } from '@/services/projectService'
import { useProjectsStore } from '@/stores/useProjectsStore'
import { useUiStore } from '@/stores/useUiStore'
import { APP } from '@/app.config'

export function useProjectImport() {
  const { t } = useI18n()
  const ui = useUiStore()
  const projects = useProjectsStore()

  /** 文件选择框的 accept：工程文件优先，JSON 作为兜底 */
  const accept = `.${APP.fileExt},application/json`

  let inputEl: HTMLInputElement | null = null
  const importing = ref(false)

  /** 模板 ref 的落点（组件里写 `:ref="setInput"`） */
  function setInput(el: Element | ComponentPublicInstance | null): void {
    inputEl = el instanceof HTMLInputElement ? el : null
  }

  function triggerImport(): void {
    inputEl?.click()
  }

  async function onFilePicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    // 立刻清空：否则连续两次选同一个文件不会触发 change 事件
    input.value = ''
    if (!file) return

    importing.value = true
    try {
      const text = await file.text()
      const result = await importDuet(text)
      if (!result.ok) {
        ui.notify(t('export.failed', { message: result.error }), 'danger')
        return
      }

      for (const item of result.value.projects) {
        const saved = await persistProject(item)
        if (!saved.ok) {
          ui.notify(saved.error, 'danger')
          return
        }
        projects.upsert(saved.value)
      }

      ui.notify(t('export.importDone', { n: result.value.projects.length }), 'success')

      const notes = [...result.value.warnings]
      if (result.value.missingAssets.length > 0) {
        notes.push(t('export.missingAssets', { n: result.value.missingAssets.length }))
      }
      if (notes.length > 0) ui.notify(notes.join('；'), 'warning')

      await projects.load()
    } catch (error) {
      ui.notify(error instanceof Error ? error.message : String(error), 'danger')
    } finally {
      importing.value = false
    }
  }

  return { setInput, importing, accept, triggerImport, onFilePicked }
}
