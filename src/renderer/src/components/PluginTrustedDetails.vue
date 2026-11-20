<template>
  <div class="trusted-details">
    <p>
      <strong>{{ detail.pluginName }} {{ detail.version }}</strong>
    </p>
    <p>发布者 {{ detail.publisher }}（{{ detail.signature }}）</p>
    <details v-if="detail.publisherIdentity">
      <summary>发布者身份</summary>
      <code>{{ detail.publisherIdentity }}</code>
    </details>
    <div class="developer-reason">
      <strong>开发者说明：</strong>
      <p>「{{ detail.reason }}」</p>
    </div>
    <strong class="warning">完全信任意味着：</strong>
    <ul class="warning">
      <li v-for="warning in detail.warning" :key="warning">{{ warning }}</li>
    </ul>
    <p v-if="detail.otherPermissions.length">其他权限：{{ detail.otherPermissions.join('、') }}</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  detail: {
    pluginName: string
    version: string
    publisher: string
    signature: string
    publisherIdentity?: string | null
    reason?: string
    warning: string[]
    otherPermissions: string[]
  }
}>()
</script>

<style scoped>
.trusted-details {
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.developer-reason {
  padding: 12px;
  margin: 14px 0;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  white-space: pre-wrap;
}
.developer-reason p {
  margin: 6px 0 0;
}
.warning {
  color: var(--td-error-color);
}
code {
  white-space: pre-wrap;
  font-size: 12px;
}
</style>
