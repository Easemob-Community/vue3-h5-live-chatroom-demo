<template>
  <!-- 互动弹幕区域 -->
  <DynamicScroller ref="scroller" :items="messageList" :min-item-size="54" class="danmaku-container">
    <template v-slot="{ item, active }">
      <DynamicScrollerItem :item="item" :active="active" :size-dependencies="[item.msg]" :data-index="item.id">
        <div class="danmaku-item">
          <span class="danmaku-nickname">{{ item.from }}</span>
          <span class="danmaku-separator">:</span>
          <span class="danmaku-content">{{ item.msg }}</span>
        </div>
      </DynamicScrollerItem>
    </template>
  </DynamicScroller>
</template>

<script setup lang="ts">
import { toRefs, watch, nextTick } from 'vue';
const props = defineProps({
  messageList: {
    type: Array,
    default: () => [],
  },
});
const { messageList } = toRefs(props);
// 弹幕列表
watch(
  () => messageList.value,
  (newVal, oldVal) => {
    console.log('messageList changed', newVal, oldVal);
    console.log('newVal.length !== oldVal.length', newVal.length !== oldVal.length);
    scrollToBottom();
  },
  { deep: true },
);
// 滚动置底
const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector('.danmaku-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
};
</script>

<style scoped>
.danmaku-container {
  /* 调整为距离底部 80px 开始 */
  bottom: 80px;
  height: calc(40vh - 80px);
  overflow-y: auto;
  overflow-x: hidden;
  position: absolute;
  left: 0;
  width: 100%;
  padding: 10px 12px;
  z-index: 1;
  top: auto;
  /* 滚动条样式 */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
}

.danmaku-item {
  display: inline-flex;
  align-items: flex-start;
  flex-wrap: wrap;
  max-width: 100%;
  margin: 6px 0;
  font-size: 14px;
  line-height: 1.5;
}

.danmaku-nickname {
  color: #ffd700;
  font-weight: 500;
  flex-shrink: 0;
}

.danmaku-separator {
  color: rgba(255, 255, 255, 0.8);
  margin: 0 4px;
  flex-shrink: 0;
}

.danmaku-content {
  color: #ffffff;
  word-break: break-word;
}
</style>
