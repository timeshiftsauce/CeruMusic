import { h, type Component } from 'vue'
import {
  NConfigProvider,
  darkTheme,
  NGlobalStyle,
  NMessageProvider,
  NDialogProvider,
  NIcon,
  useMessage,
  useDialog,
  type InputInst
} from 'naive-ui'

export {
  NConfigProvider,
  darkTheme,
  NGlobalStyle,
  NMessageProvider,
  NDialogProvider,
  NIcon,
  useMessage,
  useDialog
}

export type { InputInst }

export const renderLegacyIcon = (icon: Component) => {
  return () => h(NIcon, null, { default: () => h(icon) })
}
