/**
 * 项目列表 Store
 *
 * 只负责"列表"这一层：加载、排序、搜索、置顶。
 * 当前打开项目的编辑状态在 useProjectStore 中。
 */

import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Project } from '@/types/project'
import { filterProjects, sortProjects } from '@/db/projectsRepo'
import { listProjects } from '@/services/projectService'
import { err, ok, type Result } from '@/lib/result'

export const useProjectsStore = defineStore('projects', () => {
  /**
   * 项目列表。
   * 用 shallowRef 而非 ref：项目对象体积大（含全部行与模块），
   * 深层响应式代理既浪费性能，也容易在把数组交给纯函数时产生类型噪音。
   * 列表的更新一律通过整体替换数组完成（见 upsert/remove）。
   */
  const items = shallowRef<Project[]>([])
  const loading = ref(false)
  const query = ref('')
  const lastError = ref<string | null>(null)

  /** 搜索 + 排序后的视图列表（置顶优先 → 更新时间倒序） */
  const visible = computed(() => sortProjects(filterProjects(items.value, query.value)))

  const pinned = computed(() => visible.value.filter((project) => project.pinned))
  const recent = computed(() => visible.value.filter((project) => !project.pinned))
  const isEmpty = computed(() => items.value.length === 0)
  const hasQuery = computed(() => query.value.trim().length > 0)

  async function load(): Promise<void> {
    loading.value = true
    try {
      items.value = await listProjects()
      lastError.value = null
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.value = false
    }
  }

  /** 新增或替换一条（按 id） */
  function upsert(project: Project): void {
    const index = items.value.findIndex((item) => item.id === project.id)
    if (index === -1) items.value = [...items.value, project]
    else items.value = items.value.map((item) => (item.id === project.id ? project : item))
  }

  function remove(id: string): void {
    items.value = items.value.filter((item) => item.id !== id)
  }

  /** 恢复一条被软删除的项目（撤销删除） */
  function restore(project: Project): void {
    upsert(project)
  }

  function byId(id: string): Project | undefined {
    return items.value.find((item) => item.id === id)
  }

  function setQuery(value: string): void {
    query.value = value
  }

  async function reload(): Promise<Result<void, string>> {
    try {
      await load()
      return ok(undefined)
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    items,
    loading,
    query,
    lastError,
    visible,
    pinned,
    recent,
    isEmpty,
    hasQuery,
    load,
    reload,
    upsert,
    remove,
    restore,
    byId,
    setQuery,
  }
})
