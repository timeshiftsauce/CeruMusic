import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from '@electron-toolkit/eslint-config-prettier'

export default [
  // 基础 JavaScript 推荐配置
  js.configs.recommended,

  // TypeScript 推荐配置
  ...tseslint.configs.recommended,

  // Vue 3 推荐配置
  ...vue.configs['flat/recommended'],

  // 忽略的文件和目录
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/build/**',
      '**/.vitepress/**',
      '**/docs/**',
      '**/website/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/auto-imports.d.ts',
      '**/components.d.ts',
      'src/preload/index.d.ts', // 忽略类型定义文件
      'src/renderer/src/assets/icon_font/**', // 忽略第三方图标字体文件
      'src/main/utils/musicSdk/**', // 忽略第三方音乐 SDK
      'src/main/utils/request.js', // 忽略第三方请求库
      'scripts/**', // 忽略脚本文件
      'src/common/utils/lyricUtils/**' // 忽略第三方歌词工具
    ]
  },

  // 全局配置
  {
    files: ['**/*.{js,ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      // 代码质量 (放宽规则)
      'no-unused-vars': 'off', // 由 TypeScript 处理
      'no-undef': 'off', // 由 TypeScript 处理
      'prefer-const': 'warn', // 降级为警告
      'no-var': 'warn', // 降级为警告
      'no-duplicate-imports': 'off', // 允许重复导入
      'no-useless-return': 'off',
      'no-useless-concat': 'off',
      'no-useless-escape': 'off',
      'no-unreachable': 'warn',
      'no-debugger': 'off',

      // 代码风格 (大幅放宽)
      eqeqeq: 'off', // 允许 == 和 ===
      curly: 'off', // 允许不使用大括号
      'brace-style': 'off',
      'comma-dangle': 'off',
      quotes: 'off',
      semi: 'off',
      indent: 'off',
      'object-curly-spacing': 'off',
      'array-bracket-spacing': 'off',
      'space-before-function-paren': 'off',

      // 最佳实践 (放宽)
      'no-eval': 'warn',
      'no-implied-eval': 'warn',
      'no-new-func': 'warn',
      'no-alert': 'off',
      'no-empty': 'off', // 允许空块
      'no-extra-boolean-cast': 'off',
      'no-extra-semi': 'off',
      'no-irregular-whitespace': 'off',
      'no-multiple-empty-lines': 'off',
      'no-trailing-spaces': 'off',
      'eol-last': 'off',
      'no-fallthrough': 'off', // 允许 switch case 穿透
      'no-case-declarations': 'off', // 允许 case 中声明变量
      'no-empty-pattern': 'off', // 允许空对象模式
      'no-prototype-builtins': 'off', // 允许直接调用 hasOwnProperty
      'no-self-assign': 'off', // 允许自赋值
      'no-async-promise-executor': 'off' // 允许异步 Promise 执行器
    }
  },

  // 主进程 TypeScript 配置
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/common/**/*.ts', 'src/types/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.node.json',
        tsconfigRootDir: process.cwd()
      }
    },
    rules: {
      // TypeScript 特定规则 (大幅放宽)
      '@typescript-eslint/no-unused-vars': 'off', // 完全关闭未使用变量检查
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-var-requires': 'off', // 允许 require
      '@typescript-eslint/ban-ts-comment': 'off', // 允许 @ts-ignore
      '@typescript-eslint/no-empty-function': 'off', // 允许空函数
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-unused-expressions': 'off', // 允许未使用的表达式
      '@typescript-eslint/no-require-imports': 'off', // 允许 require 导入
      '@typescript-eslint/no-unsafe-function-type': 'off', // 允许 Function 类型
      '@typescript-eslint/prefer-as-const': 'off' // 允许字面量类型
    }
  },

  // 渲染进程 TypeScript 配置
  {
    files: ['src/renderer/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.web.json',
        tsconfigRootDir: process.cwd()
      }
    },
    rules: {
      // TypeScript 特定规则 (大幅放宽)
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/prefer-as-const': 'off'
    }
  },

  // Vue 特定配置
  {
    files: ['src/renderer/**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: '@typescript-eslint/parser',
        extraFileExtensions: ['.vue']
      }
    },
    rules: {
      // Vue 特定规则 (大幅放宽)
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off', // 允许 v-html
      'vue/require-default-prop': 'off',
      'vue/require-explicit-emits': 'off', // 不强制显式 emits
      'vue/component-definition-name-casing': 'off',
      'vue/component-name-in-template-casing': 'off',
      'vue/custom-event-name-casing': 'off', // 允许任意事件命名
      'vue/define-macros-order': 'off',
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/no-side-effects-in-computed-properties': 'off', // 允许计算属性中的副作用
      'vue/no-required-prop-with-default': 'off', // 允许带默认值的必需属性

      // TypeScript 在 Vue 中的规则 (放宽)
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off'
    }
  },

  // 主进程文件配置 (Node.js 环境)
  {
    files: [
      'src/main/**/*.{ts,js}',
      'src/preload/**/*.{ts,js}',
      'electron.vite.config.*',
      'scripts/**/*.{js,ts}'
    ],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        process: 'readonly',
        global: 'readonly'
      }
    },
    rules: {
      // Node.js 特定规则 (放宽)
      'no-console': 'off',
      'no-process-exit': 'off' // 允许 process.exit()
    }
  },

  // 渲染进程文件配置 (浏览器环境)
  {
    files: ['src/renderer/**/*.{ts,js,vue}'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly'
      }
    },
    rules: {
      // 浏览器环境特定规则
      'no-console': 'off'
    }
  },

  // 配置文件特殊规则
  {
    files: ['*.config.{js,ts}', 'vite.config.*', 'electron.vite.config.*'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-var-requires': 'off'
    }
  },

  // Prettier 配置 (必须放在最后)
  prettier
]
