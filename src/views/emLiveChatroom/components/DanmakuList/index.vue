<template>
  <!-- 互动弹幕区域 -->
  <div class="danmaku-container">
    <div class="danmaku-list">
      <div v-for="(danmaku, index) in danmakuList" :key="index" class="danmaku-item">{{ danmaku }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
// 弹幕列表
const danmakuList = ref<string[]>([]);
</script>

<style scoped>
.danmaku-container {
  /* 调整为距离底部 50px 开始，避免被输入框遮挡 */
  bottom: 50px;
  height: calc(30vh - 50px);
  overflow: hidden;
  position: absolute;
  /* 从左侧开始 */
  left: 0;
  width: 100%;
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  z-index: 1;
  /* 移除顶部定位 */
  top: auto;
}

.danmaku-list {
  position: absolute;
  bottom: 0; /* 从底部开始显示 */
  left: 0;
  width: 100%;
  height: auto; /* 高度自适应 */
}
.danmaku-item {
  color: white;
  font-size: 16px;
  padding: 8px 12px;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 10px;
  margin: 5px 10px;
  display: block; /* 改回block使每个弹幕独占一行 */
  position: relative;
  width: auto; /* 宽度自适应 */
  white-space: nowrap;
}
</style>
