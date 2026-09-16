<script setup lang="ts">
/**
 * 音频控制台编辑器
 *
 * 本模块没有需要填写的内容——它在编辑视图里也应该显示成**控制台本身**
 * （所见即所得），所以这里只给一句说明，避免出现一个空白弹窗。
 */
import { useI18n } from 'vue-i18n'
import type { ModuleEditorProps } from '../types'

defineProps<ModuleEditorProps>()

const { t } = useI18n()
</script>

<template>
  <p class="hint">{{ t('audioConsole.editorHint') }}</p>
</template>

<style scoped>
.hint {
  font-size: var(--fs-sm);
  line-height: var(--lh-normal);
  color: var(--text-muted);
}
</style>
