<template>
  <div>
    <!-- 拉流容器 -->
    <div class="live-stream-container">
      <!-- 这里可以放置拉流的视频组件，例如 video 标签 -->
      <!-- <video ref="videoRef" autoplay muted controls width="100%" height="auto"></video> -->
    </div>
    <!-- 互动弹幕区域 -->
    <div class="danmaku-container">
      <div class="danmaku-list" :style="{ transform: `translateY(${danmakuOffset}px)` }">
        <div v-for="(danmaku, index) in danmakuList" :key="index" class="danmaku-item">{{ danmaku }}</div>
      </div>
    </div>
    <!-- 发送弹幕区域 -->
    <div class="send-danmaku-container">
      <input type="text" placeholder="输入弹幕内容" />
      <button>发送</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import LIVE_STREAM_URL from '@/assets/images/live-stream.jpg'; // 替换为实际的直播流URL
// 拉流视频元素引用
const videoRef = ref<HTMLVideoElement | null>(null);
// 弹幕列表
const danmakuList = ref<string[]>([]);
// 弹幕滚动偏移量
const danmakuOffset = ref(0);
// 滚动定时器
let scrollTimer: ReturnType<typeof setInterval> | null = null;

// 模拟添加弹幕
const addDanmaku = () => {
  danmakuList.value.push(`弹幕 ${danmakuList.value.length + 1}`);
};

// 触摸开始，停止滚动
const onTouchStart = () => {
  stopDanmakuScroll();
};

// 触摸结束，继续滚动
const onTouchEnd = () => {
  startDanmakuScroll();
};

// 停止弹幕滚动
const stopDanmakuScroll = () => {
  if (scrollTimer) {
    clearInterval(scrollTimer);
    scrollTimer = null;
  }
};

onMounted(() => {});

onUnmounted(() => {});
</script>

<style scoped>
.live-stream-container {
  height: 100vh; /* 上半部分占70%的视口高度 */
  background-image: url('@/assets/images/live-stream.jpg'); /* 替换为实际的直播流背景图 */
  background-size: cover;
  background-position: center;
  display: flex;
  justify-content: center;
  align-items: center;
}

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

.send-danmaku-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: #222;
  border-top: 1px solid #333;
  position: fixed; /* 固定在页面底部 */
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100; /* 确保在其他元素之上 */
}

.send-danmaku-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: #222;
  border-top: 1px solid #333;
}

.send-danmaku-container input {
  flex: 1;
  padding: 8px;
  margin-right: 10px;
  border: none;
  border-radius: 4px;
  background-color: #333;
  color: white;
  outline: none;
}

.send-danmaku-container input::placeholder {
  color: #888;
}

.send-danmaku-container button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background-color: #007bff;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
}

.send-danmaku-container button:hover {
  background-color: #0056b3;
}
</style>
