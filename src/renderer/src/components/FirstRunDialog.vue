<template>
  <t-dialog
    v-model:visible="visible"
    header="欢迎使用 Ceru Music"
    :footer="false"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="false"
    :close-btn="false"
    placement="center"
    width="max(500px, 60vw)"
    class="first-run-dialog"
  >
    <div class="content">
      <p>本软件完全免费，代码已开源。</p>
      <p>
        开源地址：
        <a href="#" @click.prevent="openLink('https://github.com/timeshiftsauce/CeruMusic')">
          https://github.com/timeshiftsauce/CeruMusic
        </a>
      </p>
      <p>
        唯一交流QQ群：
        <span class="highlight-text" @click.prevent="openLink('https://qm.qq.com/q/CrX0TB6R3M')"
          >951962664</span
        >
      </p>

      <div class="divider"></div>

      <p>
        由于软件开发的初衷仅是为了对新技术的学习与研究，因此软件直至停止维护都将会一直保持纯净。
      </p>
      <p>
        目前本项目的原始发布地址只有 GitHub 和 QQ 群，其他渠道均为第三方转载发布，可信度请自行鉴别。
      </p>
      <p class="warning">
        本项目没有微博、抖音、小红书等之类的所谓「官方账号」，也没有在任何软件下载站或应用商店发布同名应用，谨防被骗！
      </p>
      <p class="warning">
        若你使用过程中遇到广告或者引流（如需要加群关注公众号之类才能使用或者升级）的信息，则表明你当前运行的软件是「第三方修改版」。
      </p>
      <p class="warning">本软件不对用户数据安全性做任何担保，请自行备份重要数据。</p>
      <p>
        拓展阅读：
        <a
          href="#"
          @click.prevent="
            openLink(
              'https://ceru.docs.shiqianjiang.cn/#%E6%B3%95%E5%BE%8B%E5%A3%B0%E6%98%8E%E4%B8%8E%E5%85%8D%E8%B4%A3%E6%9D%A1%E6%AC%BE'
            )
          "
        >
          法律声明与免责条款
        </a>
      </p>
    </div>

    <div class="footer-action">
      <t-button block theme="primary" size="large" @click="handleConfirm"
        >我已了解，开始使用</t-button
      >
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const visible = ref(false)
const STORAGE_KEY = 'ceru_music_has_seen_first_run_notice_tips'

const openLink = (url: string) => {
  window.open(url)
}

const handleConfirm = () => {
  localStorage.setItem(STORAGE_KEY, 'true')
  visible.value = false
  emit('next')
}
const emit = defineEmits(['next'])
onMounted(() => {
  const hasSeen = localStorage.getItem(STORAGE_KEY)
  if (!hasSeen) {
    visible.value = true
  } else {
    emit('next')
  }
})
</script>

<style scoped lang="scss">
.content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--td-text-color-primary);
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 8px;

  p {
    margin-bottom: 12px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  a {
    color: var(--td-brand-color);
    text-decoration: none;
    word-break: break-all;

    &:hover {
      text-decoration: underline;
    }
  }
}

.highlight {
  font-weight: 600;
  font-size: 16px;
  color: var(--td-brand-color);
}

.highlight-text {
  font-weight: 600;
  color: var(--td-brand-color);
}

.warning {
  color: var(--td-error-color);
  font-weight: 500;
}

.divider {
  height: 1px;
  background-color: var(--td-component-stroke);
  margin: 16px 0;
}

.footer-action {
  margin-top: 24px;
}
</style>
