<script setup lang="ts">
/**
 * 对比界面（核心视图）
 *
 * M0：空状态 + 模板画廊 + 后续里程碑说明。
 * M2：接入 CompareCanvas（行/模块编辑）；M3：接入 PresentOverlay（展示视图）。
 */
import { useI18n } from 'vue-i18n'
import TemplateGallery from '@/components/compare/TemplateGallery.vue'

const { t } = useI18n()
</script>

<template>
  <div class="compare">
    <TemplateGallery />

    <p class="compare__note">
      {{ t('compare.roadmap') }}
    </p>
  </div>
</template>

<style scoped>
.compare {
  min-height: 100%;
}

.compare__note {
  padding: 0 var(--sp-8) var(--sp-12);
  font-size: var(--fs-xs);
  color: var(--text-disabled);
  text-align: center;
}
</style>
