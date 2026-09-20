<script setup lang="ts">
import type { Appearance } from '@/types/appearance'
import { APP } from '@/app.config'
defineProps<{
  index: number
  total: number
  title: string
  kicker: string
  note: string
  appearance?: Appearance
  reading?: boolean
}>()
</script>
<template>
  <article
    class="stage-frame"
    :class="{ 'stage-frame--reading': reading }"
    aria-roledescription="slide"
    :aria-label="title"
  >
    <header class="stage-frame__head">
      <span v-if="appearance?.showBrand !== false" class="stage-frame__brand"
        >{{ APP.nameEn.toLowerCase() }}<span> / </span>{{ APP.nameZh }}</span
      ><span class="stage-frame__edition">LISTEN. COMPARE. DISCOVER.</span
      ><span v-if="appearance?.showProjectTitle !== false" class="stage-frame__series">{{
        note
      }}</span>
    </header>
    <div class="stage-frame__title">
      <p>{{ kicker }}</p>
      <h1>{{ title }}</h1>
    </div>
    <div class="stage-frame__content"><slot /></div>
    <footer class="stage-frame__foot">
      <span v-if="appearance?.showBrand !== false"
        >{{ APP.nameEn.toUpperCase() }} — COMPARISON STUDIES</span
      >
      <div class="stage-frame__steps" aria-hidden="true">
        <i v-for="n in total" :key="n" :class="{ current: n === index + 1 }" />
      </div>
      <span
        ><b>{{ String(index + 1).padStart(2, '0') }}</b> /
        {{ String(total).padStart(2, '0') }}</span
      >
    </footer>
  </article>
</template>
<style scoped>
.stage-frame {
  display: flex;
  flex-direction: column;
  width: 100%;
  aspect-ratio: 16 / 9;
  padding: 2.1cqw 3.333cqw 1.7cqw;
  color: var(--d-text);
  background: var(--d-bg);
  overflow: auto;
}
.stage-frame__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5cqw;
  padding-bottom: 1.25cqw;
  border-bottom: 1px solid var(--d-line);
  font-size: 0.75cqw;
  color: var(--d-muted);
}
.stage-frame__brand {
  font-size: 1.2cqw;
  color: var(--d-text);
  font-weight: 550;
  letter-spacing: 0.04em;
}
.stage-frame__brand span {
  color: var(--d-faint);
  margin: 0 0.3em;
  font-weight: 300;
}
.stage-frame__edition {
  letter-spacing: 0.22em;
  font-size: 0.58cqw;
}
.stage-frame__series {
  font-size: 0.68cqw;
}
.stage-frame__title {
  padding: 1.8cqw 0 1.7cqw;
}
.stage-frame__title p {
  color: var(--d-accent);
  font-family: var(--d-mono);
  letter-spacing: 0.14em;
  font-size: 0.7cqw;
  margin-bottom: 0.65cqw;
}
.stage-frame__title h1 {
  font-size: 2.35cqw;
  line-height: 1.35;
  letter-spacing: -0.035em;
  font-weight: 450;
  overflow-wrap: anywhere;
}
.stage-frame__content {
  flex: 1;
  min-height: 0;
}
.stage-frame__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2cqw;
  border-top: 1px solid var(--d-line);
  padding-top: 1cqw;
  margin-top: 1.8cqw;
  color: var(--d-muted);
  font-family: var(--d-mono);
  font-size: 0.6cqw;
  letter-spacing: 0.08em;
}
.stage-frame__foot b {
  color: var(--d-text);
  font-weight: 400;
}
.stage-frame__steps {
  display: flex;
  gap: 0.5cqw;
}
.stage-frame__steps i {
  display: block;
  width: 1.65cqw;
  height: 2px;
  background: var(--d-line);
}
.stage-frame__steps i.current {
  background: var(--d-accent);
}
.stage-frame--reading {
  aspect-ratio: auto;
  min-height: 56.25cqw;
}
.stage-frame--reading .stage-frame__content {
  min-height: auto;
}
@media (max-width: 700px) {
  .stage-frame {
    aspect-ratio: auto;
    min-height: 100%;
    padding: 24px;
  }
  .stage-frame__head {
    font-size: 10px;
    padding-bottom: 18px;
  }
  .stage-frame__brand {
    font-size: 16px;
  }
  .stage-frame__edition {
    display: none;
  }
  .stage-frame__series {
    font-size: 10px;
  }
  .stage-frame__title {
    padding: 24px 0;
  }
  .stage-frame__title p {
    font-size: 10px;
    margin-bottom: 10px;
  }
  .stage-frame__title h1 {
    font-size: 28px;
  }
  .stage-frame__content {
    min-height: auto;
  }
  .stage-frame__foot {
    margin-top: 28px;
    padding-top: 18px;
    font-size: 8px;
  }
  .stage-frame__steps {
    display: none;
  }
}
</style>
