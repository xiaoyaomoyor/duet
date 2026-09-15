<script setup lang="ts">
/**
 * 品牌标记（对奏 Duet）
 *
 * 图形语义：一块方形的对比画布被中轴分开，
 * 左侧四个方块由大变小、右侧由小变大 —— 即"同台演奏 + 势均力敌的对照"。
 */
withDefaults(defineProps<{ size?: number }>(), { size: 24 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Duet"
  >
    <rect x="1" y="1" width="22" height="22" rx="6" fill="#150F26" stroke="#3A2B63" />
    <path d="M12 4.5v15" stroke="#6B57B5" stroke-width="1.1" stroke-linecap="round" />
    <rect x="4" y="8.4" width="3.4" height="7.2" rx="1.1" fill="#A78BFA" />
    <rect x="8.6" y="10.2" width="2.4" height="3.6" rx="0.9" fill="#7C5CE0" />
    <rect x="16.6" y="8.4" width="3.4" height="7.2" rx="1.1" fill="#22D3EE" />
    <rect x="13" y="10.2" width="2.4" height="3.6" rx="0.9" fill="#1B93AC" />
  </svg>
</template>
