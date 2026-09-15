import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import globals from 'globals'

/**
 * 对奏 Duet — 代码检查配置（扁平配置，ESLint 10+）
 *
 * 取舍：只启用 vue 的 **essential** 规则集（正确性），不启用 stylistic 规则集。
 * 排版一律交给 Prettier（.prettierrc.json），避免两套工具互相打架、
 * 也避免为了迁就 lint 而写出难读的模板。
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.npm-cache/**',
      'playwright-report/**',
      'test-results/**',
      'src-tauri/target/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  {
    // 浏览器端源码
    files: ['src/**/*.{ts,vue}', 'env.d.ts'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },

  {
    // 测试代码同时运行在 Node 与 jsdom 下
    files: ['src/**/*.spec.ts', 'src/test/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  {
    // 构建脚本与配置文件
    files: ['scripts/**/*.mjs', '*.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: { 'no-console': 'off' },
  },

  {
    rules: {
      // 视图/布局组件按领域命名（CompareCanvas、SideHeader…），不强制多词
      'vue/multi-word-component-names': 'off',
      // 模块渲染器需要动态组件与 v-html（markdown / richText 模块）
      'vue/no-v-html': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 禁止 any：与 §19.1 一致，必要时用 unknown + 类型守卫
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
)
