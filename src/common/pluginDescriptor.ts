import type {
  ProviderDeclaration,
  PermissionDeclaration,
  MenuContribution,
  StyleContribution,
  ViewDeclaration,
  ActionDeclaration,
  ImporterDeclaration,
  LyricConverterDeclaration,
  AccountDeclaration,
  GuestAdapterDeclaration,
  ServiceDeclaration,
  PluginDependency,
  PageDeclaration,
  HomeSectionDeclaration,
  SlotDeclaration,
  RegionDeclaration,
  SkinDeclaration,
  PluginManifest
} from '@shiqianjiang/ceru-plugin-sdk'

export type ProviderInfo = ProviderDeclaration & { pluginId: string }
export type ImporterInfo = ImporterDeclaration & { pluginId: string }
export type LyricConverterInfo = LyricConverterDeclaration & { pluginId: string }
export type AccountInfo = AccountDeclaration & {
  legacy?: { view: string; action: string; logoutAction?: string }
} & { pluginId: string }
export type ActionInfo = ActionDeclaration & { pluginId: string }
export type PermissionInfo = PermissionDeclaration & { pluginId: string }
export type ViewInfo = Omit<ViewDeclaration, 'kind'> & {
  kind: ViewDeclaration['kind'] | 'schema'
  pluginId: string
}
export type PageInfo = PageDeclaration & { pluginId: string }
export type HomeSectionInfo = HomeSectionDeclaration & { pluginId: string }
export type SlotInfo = SlotDeclaration & { pluginId: string }
export type MenuInfo = MenuContribution & { pluginId: string }
export type StyleInfo = StyleContribution & { pluginId: string }
export type ServiceInfo = ServiceDeclaration & { pluginId: string }
export type DependencyInfo = Omit<PluginDependency, 'pluginId'> & {
  targetPluginId: string
  pluginId: string
}
export type GuestAdapterInfo = GuestAdapterDeclaration & { pluginId: string }
export type RegionInfo = RegionDeclaration & { pluginId: string }
export type SkinInfo = SkinDeclaration & { pluginId: string }
export type ServerInfo = NonNullable<PluginManifest['entry']['server']> & { pluginId: string }
export type NativeModuleInfo = NonNullable<PluginManifest['entry']['native']>[number] & {
  pluginId: string
}

export interface PluginDescriptor {
  runtime: 2 | 3
  id: string
  name: string
  version: string
  description?: string
  author?: string
  homepage?: string
  hasShareResolver: boolean
  providers: ProviderInfo[]
  importers: ImporterInfo[]
  lyricConverters: LyricConverterInfo[]
  accounts: AccountInfo[]
  actions: ActionInfo[]
  permissions: PermissionInfo[]
  views: ViewInfo[]
  pages: PageInfo[]
  homeSections: HomeSectionInfo[]
  slots: SlotInfo[]
  menus: MenuInfo[]
  styles: StyleInfo[]
  services: ServiceInfo[]
  dependencies: DependencyInfo[]
  guestAdapters: GuestAdapterInfo[]
  regions: RegionInfo[]
  skins: SkinInfo[]
  server?: ServerInfo
  nativeModules: NativeModuleInfo[]
  trusted?: { optional: boolean; reason: string }
}
