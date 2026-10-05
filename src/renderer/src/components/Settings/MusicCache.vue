<template>
  <div class="music-cache">
    <t-card hover-shadow :loading="!cacheInfo || cacheInfo.clearing" title="本地歌曲缓存">
      <div class="usage">
        <div class="usage-head">
          <div class="usage-figure">
            <span class="usage-size">{{ cacheInfo?.sizeFormatted || '0 B' }}</span>
            <span class="usage-cap">/ {{ cacheInfo?.maxFormatted || '不限制' }}</span>
          </div>
          <span class="usage-count">
            {{ cacheInfo?.count > 0 ? `${cacheInfo.count} 个文件` : '暂无缓存文件' }}
          </span>
        </div>
        <t-progress
          theme="line"
          :percentage="Math.min(100, Math.round(cacheInfo?.percent || 0))"
          :label="false"
          :status="(cacheInfo?.percent || 0) >= 90 ? 'warning' : 'active'"
        />
        <div class="usage-actions">
          <t-button
            theme="danger"
            variant="outline"
            :loading="cacheInfo?.clearing"
            :disabled="!cacheInfo?.count || cacheInfo?.count === 0"
            @click="clearCache"
          >
            {{ cacheInfo?.clearing ? '正在清除...' : '清除本地缓存' }}
          </t-button>
        </div>
      </div>

      <!-- 音质占比：环形图 + 图例。封面/歌词占用小，只用一行文字带过 -->
      <div v-if="donutSegments.length" class="quality-section">
        <div class="section-title">音质占比</div>
        <div class="quality-body">
          <div ref="chartEl" class="donut-chart" role="img" aria-label="缓存音质占比"></div>

          <ul class="legend">
            <li v-for="seg in donutSegments" :key="seg.quality" class="legend-item">
              <span class="legend-dot" :style="{ background: seg.color }"></span>
              <span class="legend-name">{{ seg.label }}</span>
              <span class="legend-count">{{ seg.count }} 首</span>
              <span class="legend-size">{{ seg.sizeFormatted }}</span>
              <span class="legend-pct">{{ seg.percent.toFixed(0) }}%</span>
            </li>
          </ul>
        </div>

        <!-- 封面 / 歌词：占用小，一行带过 -->
        <div class="minor-line">
          <span v-for="item in minorItems" :key="item.key" class="minor-item">
            <t-icon :name="item.icon" size="14px" />
            <span class="minor-name">{{ item.name }}</span>
            <span class="minor-value">{{ item.sizeFormatted }}</span>
            <span v-if="item.count > 0" class="minor-count">{{ item.count }} 个</span>
          </span>
        </div>
      </div>
    </t-card>

    <t-card hover-shadow title="容量与音质" class="policy-card">
      <div class="setting-item">
        <div class="item-info">
          <div class="item-title">最大缓存容量</div>
          <div class="item-desc">超出后自动按最近最少播放顺序清理旧缓存</div>
        </div>
        <div class="item-control">
          <t-input-number
            v-model="maxSizeGb"
            theme="normal"
            :min="1"
            :max="1024"
            :step="1"
            :decimal-places="0"
            suffix="GB"
            style="width: 160px"
            @blur="savePolicy"
            @enter="savePolicy"
          />
        </div>
      </div>

      <div class="setting-item">
        <div class="item-info">
          <div class="item-title">缓存音质上限</div>
          <div class="item-desc">高于该音质的歌曲不写入缓存，避免占用过多空间</div>
        </div>
        <div class="item-control">
          <t-select v-model="maxQuality" style="width: 160px" @change="savePolicy">
            <t-option
              v-for="opt in qualityOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </t-select>
        </div>
      </div>

      <div class="policy-actions">
        <t-button theme="default" variant="outline" :loading="saving" @click="savePolicy">
          保存策略
        </t-button>
        <t-button theme="default" variant="text" :loading="evicting" @click="enforceLimit">
          立即清理到上限
        </t-button>
      </div>
      <div v-if="!optionsReady" class="no-cache-tip">
        缓存音质候选取决于已安装插件，暂无可用选项
      </div>
    </t-card>
  </div>
</template>

<script lang="ts" setup>
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { pluginQualityOrder } from '@renderer/utils/pluginQuality'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { getQualityDisplayName } from '@common/utils/quality'

echarts.use([PieChart, TooltipComponent, TitleComponent, CanvasRenderer])

// 定义事件
const emit = defineEmits<{
  'cache-cleared': []
}>()

const cacheInfo: any = ref({})
const maxSizeGb = ref(15)
const maxQuality = ref('flac')
const saving = ref(false)
const evicting = ref(false)

/** 音质候选：聚合所有已安装音源声明过的音质，按出现顺序从低到高 */
const qualityOptions = computed(() => {
  const order: string[] = []
  const sources = LocalUserDetailStore().userInfo.supportedSources || {}
  for (const key of Object.keys(sources)) {
    for (const q of pluginQualityOrder(key)) {
      if (!order.includes(q)) order.push(q)
    }
  }
  const options = order.map((q) => ({ value: q, label: getQualityDisplayName(q) || q }))
  // 「不限制」放最后，语义上最高
  options.push({ value: '', label: '不限制（缓存所有音质）' })
  return options
})
const optionsReady = computed(() => qualityOptions.value.length > 1)

/**
 * 环形图的配色：按音质从低到高渐变（低音质偏浅、高音质偏深）。
 * 用固定色板而非随机色，保证同一音质每次进来颜色一致，便于记忆。
 *
 * echarts 画在 canvas 上，无法解析 CSS 变量，因此这里取的是 TDesign 品牌色的
 * 实际色值（与 --td-brand-color-3/5/6/7/8 保持一致）。
 */
const QUALITY_COLORS = ['#93b8f5', '#0052d9', '#366ef4', '#2447a8', '#182f7a']
/** 未知音质用中性灰，避免与已知音质抢视觉焦点 */
const UNKNOWN_COLOR = '#b8bcc4'

/**
 * 解析 CSS 变量为真实色值，供 echarts canvas 使用。
 * 读不到（如 SSR 或样式未就绪）时回退到传入的默认值。
 */
function resolveCssColor(cssVar: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const match = /var\((--[^)]+)\)/.exec(cssVar)
  if (!match) return cssVar
  const value = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim()
  return value || fallback
}

/**
 * 音质分段数据。
 * percent 由后端给出（相对音频总量），直接作为环形图占比。
 */
const donutSegments = computed(() => {
  const list: any[] = cacheInfo.value?.qualityBreakdown || []
  return list.map((item: any, index: number) => ({
    ...item,
    // 占比限制在 0-100，避免浮点误差让占比失真
    percent: Math.max(0, Math.min(100, Number(item.percent) || 0)),
    color:
      item.quality === '未知'
        ? resolveCssColor(UNKNOWN_COLOR, '#b8bcc4')
        : QUALITY_COLORS[index % QUALITY_COLORS.length],
    label: cardLabel(item.quality)
  }))
})

/** 音质标识 → 中文显示名（未知音质原样显示） */
function cardLabel(quality: string): string {
  if (!quality || quality === '未知') return '未知'
  return getQualityDisplayName(quality) || quality
}

/** 环形图中心的音频总量文案（只显示数值，单位单独排） */
const audioTotalText = computed(() => {
  const bytes = (cacheInfo.value?.qualityBreakdown || []).reduce(
    (sum: number, i: any) => sum + (i.size || 0),
    0
  )
  // 直接复用后端已算好的格式化结果，保证与图例口径一致
  const total = (cacheInfo.value?.breakdown || []).find((b: any) => b.key === 'audio')
  return total?.sizeFormatted || formatBytesShort(bytes)
})

/** 极简的字节格式化（后端未返回时兜底） */
function formatBytesShort(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${Number((bytes / 1024 ** i).toFixed(1))} ${units[i]}`
}

/* ---------------- 音质占比环形图（echarts） ---------------- */

const chartEl = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

/** 组装 echarts 的 option：环形图 + 悬停 tooltip + 中心总量 */
function buildChartOption() {
  const textPrimary = resolveCssColor('var(--settings-text-primary)', '#1f2329')
  const textSecondary = resolveCssColor('var(--settings-text-secondary)', '#8f959e')
  return {
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: any) =>
        `${params.marker}${params.name}<br/>` +
        `${params.data.count} 首 · ${params.data.sizeFormatted}<br/>` +
        `占比 ${params.percent}%`
    },
    // 中心文字用 graphic 叠加，避免依赖 pie label 的定位（echarts 6 下易偏移）
    // 中心总量用 title/subtext 呈现：TDesign 无图表组件，echarts 的 title
    // 原生支持绝对居中，比 graphic 百分比定位更可靠。
    title: {
      left: 'center',
      top: 'center',
      text: audioTotalText.value,
      subtext: '音频',
      itemGap: 2,
      textStyle: { fontSize: 14, fontWeight: 600, color: textPrimary },
      subtextStyle: { fontSize: 11, color: textSecondary }
    },
    series: [
      {
        type: 'pie',
        // 留出边距，避免环被容器裁切
        radius: ['58%', '78%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        // 悬停时轻微放大分段，给出交互反馈
        emphasis: { scale: true, scaleSize: 6 },
        label: { show: false },
        labelLine: { show: false },
        data: donutSegments.value.map((seg) => ({
          name: seg.label,
          value: seg.size || 0,
          count: seg.count,
          sizeFormatted: seg.sizeFormatted,
          itemStyle: { color: seg.color, borderWidth: 0 }
        }))
      }
    ]
  }
}

/** 创建或更新图表 */
function renderChart() {
  if (!chartEl.value) return
  if (!chart) {
    chart = echarts.init(chartEl.value)
  }
  chart.setOption(buildChartOption(), true)
  chart.resize()
}

const handleResize = () => chart?.resize()

watch(
  () => donutSegments.value,
  async () => {
    await nextTick()
    if (!donutSegments.value.length) {
      chart?.dispose()
      chart = null
      return
    }
    renderChart()
  },
  { deep: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
})

/** 封面 / 歌词：占用小，用一行小字带过，不占图表位置 */
const minorItems = computed(() => {
  const list: any[] = cacheInfo.value?.breakdown || []
  const pick = (key: string, icon: string, name: string) => {
    const item = list.find((b: any) => b.key === key)
    return {
      key,
      icon,
      name,
      sizeFormatted: item?.sizeFormatted || '0 B',
      count: item?.count || 0
    }
  }
  return [
    pick('cover', 'image', '封面'),
    pick('lyric', 'chat-bubble', '歌词')
  ]
})

const loadCacheInfo = async (forceRefresh = false) => {
  try {
    console.log('正在获取缓存信息...', forceRefresh ? '(强制刷新)' : '')
    const res = await window.api.musicCache.getInfo()
    console.log('获取到缓存信息:', res)
    cacheInfo.value = res
  } catch (error) {
    console.error('获取缓存信息失败:', error)
    MessagePlugin.error('获取缓存信息失败')
  }
}

const loadPolicy = async () => {
  try {
    const policy = await window.api.musicCache.getPolicy()
    if (policy?.maxBytes > 0) {
      maxSizeGb.value = Math.max(1, Math.round(policy.maxBytes / 1024 ** 3))
    }
    maxQuality.value = policy?.maxQuality ?? 'flac'
  } catch (error) {
    console.error('获取缓存策略失败:', error)
  }
}

const savePolicy = async () => {
  if (saving.value) return
  saving.value = true
  try {
    const result = await window.api.musicCache.setPolicy({
      maxBytes: Math.max(1, Number(maxSizeGb.value) || 1) * 1024 ** 3,
      maxQuality: maxQuality.value
    })
    if (!result?.success) {
      MessagePlugin.error(result?.message || '保存缓存策略失败')
      return
    }
    MessagePlugin.success(
      (result.evicted ?? 0) > 0
        ? `缓存策略已保存，清理了 ${result.evicted} 个旧文件`
        : '缓存策略已保存'
    )
    await loadCacheInfo(true)
  } catch (error) {
    console.error('保存缓存策略失败:', error)
    MessagePlugin.error('保存缓存策略失败')
  } finally {
    saving.value = false
  }
}

const enforceLimit = async () => {
  if (evicting.value) return
  evicting.value = true
  try {
    const result = await window.api.musicCache.enforceLimit()
    if (!result?.success) {
      MessagePlugin.error(result?.message || '清理失败')
      return
    }
    MessagePlugin.success(
      (result.evicted ?? 0) > 0 ? `已清理 ${result.evicted} 个旧缓存文件` : '当前缓存未超出上限'
    )
    await loadCacheInfo(true)
  } catch (error) {
    console.error('清理缓存失败:', error)
    MessagePlugin.error('清理缓存失败')
  } finally {
    evicting.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadCacheInfo(), loadPolicy()])
  await nextTick()
  if (donutSegments.value.length) renderChart()
  window.addEventListener('resize', handleResize)
})

const clearCache = () => {
  const confirm = DialogPlugin.confirm({
    header: '确认清除缓存吗',
    body: '这可能会导致歌曲加载缓慢，你确定要清除所有缓存吗？',
    confirmBtn: '确定清除',
    cancelBtn: '我再想想',
    placement: 'center',
    onClose: () => {
      confirm.hide()
    },
    onConfirm: async () => {
      confirm.hide()

      try {
        // 显示加载状态
        cacheInfo.value = { ...cacheInfo.value, clearing: true }

        // 执行清除操作
        const result = await window.api.musicCache.clear()

        if (result.success) {
          console.log('缓存清除成功，开始更新界面')
          MessagePlugin.success(result.message || '缓存清除成功')

          // 发射缓存清除事件
          emit('cache-cleared')

          // 立即重置缓存信息显示
          cacheInfo.value = {
            count: 0,
            size: 0,
            sizeFormatted: '0 B',
            clearing: false
          }

          // 多次尝试重新加载，确保获取到最新状态
          let retryCount = 0
          const maxRetries = 3

          const reloadWithRetry = async () => {
            retryCount++
            console.log(`第${retryCount}次尝试重新加载缓存信息`)

            await loadCacheInfo(true)

            // 如果还有缓存文件且重试次数未达上限，继续重试
            if (cacheInfo.value.count > 0 && retryCount < maxRetries) {
              console.log(`仍有${cacheInfo.value.count}个缓存文件，1秒后重试`)
              setTimeout(reloadWithRetry, 1000)
            } else {
              console.log('缓存信息更新完成:', cacheInfo.value)
            }
          }

          // 延迟一下再开始重新加载
          setTimeout(reloadWithRetry, 300)
        } else {
          MessagePlugin.error(result.message || '缓存清除失败')
          // 清除加载状态
          if (cacheInfo.value.clearing) {
            delete cacheInfo.value.clearing
          }
        }
      } catch (error) {
        console.error('清除缓存失败:', error)
        MessagePlugin.error('清除缓存失败，请重试')
        // 清除加载状态
        if (cacheInfo.value.clearing) {
          delete cacheInfo.value.clearing
        }
      }
    }
  })
}

// 刷新缓存信息（供父组件调用）
const refreshCacheInfo = async () => {
  console.log('刷新缓存信息')
  await loadCacheInfo(true)
}

// 暴露方法给父组件
defineExpose({
  refreshCacheInfo
})
</script>

<style lang="scss" scoped>
.music-cache {
  width: 100%;

  :deep(.t-card) {
    border: 1px solid var(--settings-feature-border);
    border-radius: 0.75rem;
  }

  .policy-card {
    margin-top: 20px;
  }

  .usage {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .usage-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;

      .usage-figure {
        display: flex;
        align-items: baseline;
        gap: 6px;
        min-width: 0;

        .usage-size {
          font-size: 22px;
          font-weight: 600;
          line-height: 1;
          color: var(--settings-text-primary);
          font-variant-numeric: tabular-nums;
        }

        .usage-cap {
          font-size: 13px;
          color: var(--settings-text-secondary);
        }
      }

      .usage-count {
        flex-shrink: 0;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        color: var(--settings-text-secondary);
        background: var(--settings-feature-bg);
        border: 1px solid var(--settings-feature-border);
      }
    }

    :deep(.t-progress) {
      margin: 0;
    }

    .usage-actions {
      display: flex;
      justify-content: flex-end;
    }
  }

  /* 音质占比区域 */
  .quality-section {
    margin-top: 4px;
    padding-top: 16px;
    border-top: 1px solid var(--settings-feature-border);

    .section-title {
      margin-bottom: 12px;
      font-size: 13px;
      font-weight: 600;
      color: var(--settings-text-primary);
    }

    .quality-body {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    /* 环形图：直径约 140px，不抢版面 */
    .donut-chart {
      flex-shrink: 0;
      width: 140px;
      height: 140px;
    }

    /* 图例紧贴环形图，宽度自适应内容，不撑满整行 */
    .legend {
      margin: 0;
      padding: 0;
      list-style: none;
      min-width: 0;

      .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 0;
        font-size: 12px;
        color: var(--settings-text-secondary);

        .legend-dot {
          flex-shrink: 0;
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .legend-name {
          flex-shrink: 0;
          width: 44px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--settings-text-primary);
        }

        /* 数值列右对齐 + 等宽数字，扫读时不跳动 */
        .legend-count,
        .legend-size,
        .legend-pct {
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
          text-align: right;
        }

        .legend-count {
          width: 40px;
        }

        .legend-size {
          width: 60px;
        }

        .legend-pct {
          width: 34px;
          color: var(--settings-text-primary);
        }
      }
    }

    /* 封面 / 歌词一行带过 */
    .minor-line {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 12px;
      font-size: 12px;
      color: var(--settings-text-secondary);

      .minor-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;

        .minor-name {
          color: var(--settings-text-secondary);
        }

        .minor-value {
          color: var(--settings-text-primary);
          font-variant-numeric: tabular-nums;
        }

        .minor-count {
          color: var(--settings-text-secondary);
          opacity: 0.75;
        }
      }
    }
  }

  .setting-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 0;
    border-bottom: 1px solid var(--settings-feature-border);

    &:last-of-type {
      border-bottom: none;
    }

    .item-info {
      flex: 1;
      min-width: 0;

      .item-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--settings-text-primary);
      }

      .item-desc {
        margin-top: 4px;
        font-size: 12px;
        line-height: 1.5;
        color: var(--settings-text-secondary);
      }
    }

    .item-control {
      flex-shrink: 0;
    }
  }

  .policy-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--settings-feature-border);
  }

  .no-cache-tip {
    margin-top: 12px;
    font-size: 13px;
    color: var(--settings-text-secondary);
  }
}
</style>
