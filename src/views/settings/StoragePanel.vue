<script setup lang="ts">
/**
 * 数据与存储：用量可视化、数据统计、清理、备份、清空
 *
 * 这是用户数据安全感最集中的一屏，因此：
 *   - 用量、持久化授权状态都如实展示（不隐藏"未获授权"的风险）
 *   - 清空操作要求输入确认文字（§18 K2）
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import SettingsField from '@/components/common/SettingsField.vue'
import { useProjectsStore } from '@/stores/useProjectsStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/useUiStore'
import { estimateStorage, requestPersistentStorage } from '@/services/themeService'
import { cleanupUnreferencedAssets } from '@/services/assetService'
import {
  backupFileName,
  clearAllData,
  countAll,
  exportAllProjects,
  type DataCounts,
} from '@/services/maintenanceService'
import { downloadJson } from '@/lib/download'
import { formatBytes } from '@/lib/media'

const { t } = useI18n()
const router = useRouter()
const projects = useProjectsStore()
const project = useProjectStore()
const ui = useUiStore()

const usage = ref({ usage: 0, quota: 0, ratio: 0, persisted: false })
const counts = ref<DataCounts>({ projects: 0, assets: 0, tools: 0 })
const busy = ref(false)
const confirmClear = ref(false)

const usageLabel = computed(() =>
  usage.value.quota > 0
    ? `${formatBytes(usage.value.usage)} / ${formatBytes(usage.value.quota)}`
    : t('settings.quotaUnavailable'),
)

const usagePercent = computed(() =>
  usage.value.quota > 0 ? Math.min(100, Math.round(usage.value.ratio * 1000) / 10) : 0,
)

async function refresh(): Promise<void> {
  usage.value = await estimateStorage()
  counts.value = await countAll()
}

onMounted(refresh)

async function requestPersist(): Promise<void> {
  const granted = await requestPersistentStorage()
  ui.notify(granted ? t('settings.persistGranted') : t('settings.persistDenied'), granted ? 'success' : 'warning')
  await refresh()
}

async function runCleanup(): Promise<void> {
  busy.value = true
  try {
    const report = await cleanupUnreferencedAssets(projects.items)
    if (report.removedAssets === 0) {
      ui.notify(t('settings.cleanupNone'), 'info')
    } else {
      ui.notify(
        t('settings.cleanupDone', {
          n: report.removedAssets,
          size: formatBytes(report.freedBytes),
        }),
        'success',
      )
    }
    await refresh()
  } finally {
    busy.value = false
  }
}

async function exportAll(): Promise<void> {
  const result = await exportAllProjects()
  if (!result.ok) {
    ui.notify(result.error, 'warning')
    return
  }
  downloadJson(result.value, backupFileName())
  ui.notify(t('toast.saved'), 'success')
}

async function doClearAll(): Promise<void> {
  confirmClear.value = false
  busy.value = true
  try {
    // 先关闭所有标签页，避免内存中仍持有已被删除的项目
    await project.closeAllTabs()
    const result = await clearAllData()
    if (!result.ok) {
      ui.notify(result.error, 'danger')
      return
    }
    await projects.load()
    await refresh()
    // 数据已经不存在了，把路由也带回空状态，避免停留在指向已删除项目的地址上
    await router.replace({ name: 'compare' })
    ui.notify(t('toast.allCleared'), 'success')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <h3 class="panel__heading">{{ t('settings.storage') }}</h3>

  <SettingsField :label="t('settings.quota')">
    <div class="quota">
      <div class="quota__bar" role="progressbar" :aria-valuenow="usagePercent" aria-valuemin="0" aria-valuemax="100">
        <span class="quota__fill" :style="{ width: `${usagePercent}%` }" />
      </div>
      <div class="quota__meta">
        <span>{{ usageLabel }}</span>
        <span :class="usage.persisted ? 'quota__ok' : 'quota__warn'">
          {{ usage.persisted ? t('settings.persisted') : t('settings.persistedNo') }}
        </span>
      </div>
      <button v-if="!usage.persisted" class="ghost-btn" type="button" @click="requestPersist">
        <AppIcon name="lock" :size="13" />
        {{ t('settings.requestPersist') }}
      </button>
    </div>
  </SettingsField>

  <SettingsField :label="t('settings.counts')">
    <ul class="counts">
      <li>
        <span class="counts__value">{{ counts.projects }}</span>
        <span class="counts__label">{{ t('settings.projectsCount') }}</span>
      </li>
      <li>
        <span class="counts__value">{{ counts.assets }}</span>
        <span class="counts__label">{{ t('settings.assetsCount') }}</span>
      </li>
      <li>
        <span class="counts__value">{{ counts.tools }}</span>
        <span class="counts__label">{{ t('tools.custom') }}</span>
      </li>
    </ul>
  </SettingsField>

  <SettingsField :label="t('settings.cleanup')" :hint="t('settings.cleanupHint')">
    <div class="actions">
      <button class="ghost-btn" type="button" :disabled="busy" @click="runCleanup">
        <AppIcon name="trash" :size="13" />
        {{ t('settings.cleanup') }}
      </button>
      <button class="ghost-btn" type="button" :disabled="busy" @click="exportAll">
        <AppIcon name="export" :size="13" />
        {{ t('nav.export') }}
      </button>
    </div>
  </SettingsField>

  <div class="danger">
    <span class="danger__title">{{ t('settings.dangerZone') }}</span>
    <p class="danger__hint">{{ t('settings.clearAllHint') }}</p>
    <button class="btn btn--danger" type="button" :disabled="busy" @click="confirmClear = true">
      {{ t('settings.clearAll') }}
    </button>
  </div>

  <AppDialog
    :open="confirmClear"
    tone="danger"
    require-text="DELETE"
    :title="t('settings.clearAll')"
    :message="t('settings.clearAllConfirm')"
    :confirm-label="t('settings.clearAll')"
    @confirm="doClearAll"
    @cancel="confirmClear = false"
  />
</template>

<style scoped>
.panel__heading {
  margin-bottom: var(--sp-5);
  font-size: var(--fs-lg);
}

.quota {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.quota__bar {
  height: 8px;
  overflow: hidden;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
}

.quota__fill {
  display: block;
  height: 100%;
  background: var(--grad-brand);
  transition: width var(--dur-slow) var(--ease-out);
}

.quota__meta {
  display: flex;
  gap: var(--sp-3);
  align-items: baseline;
  justify-content: space-between;
  font-size: var(--fs-xs);
}

.quota__ok {
  color: var(--success);
}

.quota__warn {
  color: var(--warning);
}

.counts {
  display: flex;
  gap: var(--sp-6);
}

.counts li {
  display: flex;
  flex-direction: column;
}

.counts__value {
  font-size: var(--fs-xl);
  font-weight: 600;
}

.counts__label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.ghost-btn {
  display: inline-flex;
  gap: var(--sp-1);
  align-items: center;
  width: fit-content;
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  transition: color var(--dur-fast) var(--ease-out);
}

.ghost-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.danger {
  padding: var(--sp-4);
  border: 1px solid var(--danger);
  border-radius: var(--radius-md);
}

.danger__title {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--danger);
}

.danger__hint {
  margin: var(--sp-1) 0 var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.btn {
  padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-sm);
  border-radius: var(--radius-sm);
}

.btn--danger {
  color: var(--text-inverse);
  background: var(--danger);
}

.btn--danger:hover:not(:disabled) {
  filter: brightness(1.08);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
