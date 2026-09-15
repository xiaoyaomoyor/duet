/**
 * 侧栏搜索 Store
 *
 * 侧栏输入框与命令面板共享同一个搜索词，放在这里避免组件间互相传参。
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useProjectsStore } from './useProjectsStore'

export const useSidebarStore = defineStore('sidebar', () => {
  const projects = useProjectsStore()
  const query = ref('')

  const searching = computed(() => query.value.trim().length > 0)

  function setQuery(value: string): void {
    query.value = value
    // 侧栏与顶栏共用一份列表，搜索词同步给项目列表
    projects.setQuery(value)
  }

  function clear(): void {
    setQuery('')
  }

  return { query, searching, setQuery, clear }
})
