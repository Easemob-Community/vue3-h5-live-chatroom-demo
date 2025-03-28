<template>
  <!-- 互动弹幕区域 -->
  <DynamicScroller ref="scroller" :items="messageList" :min-item-size="54" class="danmaku-container">
    <template v-slot="{ item, active }">
      <DynamicScrollerItem :item="item" :active="active" :size-dependencies="[item.msg]" :data-index="item.id">
        <div class="danmaku-item">{{ item.from }}： {{ item.msg }}</div>
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
  overflow-y: auto; /* 改为auto允许滚动 */
  overflow-x: hidden; /* 水平方向不滚动 */
  position: absolute;
  left: 0;
  width: 100%;
  padding: 10px 0; /* 添加上下内边距 */
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  z-index: 1;
  top: auto;
  /* 添加滚动条样式 */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
  border-radius: 20px;
}

.danmaku-item {
  color: white;
  font-size: 16px;
  padding: 8px 12px;
  border-radius: 10px;
  display: block;
  position: relative;
  width: fit-content;
  max-width: 90%;
  white-space: normal;
  word-break: break-word;
  margin: 8px 0; /* 添加上下8px的外边距 */
  /* 或者使用以下方式单独控制上下间距 */
  /* margin-top: 8px; */
  /* margin-bottom: 8px; */
}
</style>
