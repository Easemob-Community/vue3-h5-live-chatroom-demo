<template>
  <div class="live-container">
    <!-- 底层：RTC推拉流组件 -->
    <div class="rtc-layer">
      <slot name="rtc"></slot>
    </div>

    <!-- 中层：弹幕显示层 -->
    <div class="danmaku-layer">
      <slot name="danmaku"></slot>
    </div>

    <!-- 控制层：顶部 -->
    <div class="control-layer-top">
      <!-- 顶部操作栏 -->
      <div class="top-actions">
        <slot name="control-top"></slot>
      </div>
      <!-- 状态信息栏 - 与操作栏在同一容器但另起一行 -->
      <div v-if="showStatus" class="status-bar">
        <div class="status-info">
          <div v-if="rtcStatus" class="status-item">
            <span class="status-label">RTC:</span>
            <span :class="['status-value', rtcStatus.joined ? 'connected' : 'disconnected']">
              {{ rtcStatus.joined ? '已连接' : '未连接' }}
            </span>
          </div>
          <div v-if="imStatus" class="status-item">
            <span class="status-label">IM:</span>
            <span :class="['status-value', imStatus.connected ? 'connected' : 'disconnected']">
              {{ imStatus.connected ? '已连接' : '未连接' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 控制层：底部 -->
    <div class="control-layer">
      <slot name="control"></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 定义组件属性
interface ContainerProps {
  /** 是否显示状态信息 */
  showStatus?: boolean
}

const props = withDefaults(defineProps<ContainerProps>(), {
  showStatus: false
})

// 状态信息
interface RtcStatus {
  joined: boolean
  channelId: string | null
  localUid: string | null
}

interface ImStatus {
  connected: boolean
  userId: string | null
}

const rtcStatus = ref<RtcStatus | null>(null)
const imStatus = ref<ImStatus | null>(null)

// 更新RTC状态
const updateRtcStatus = (status: RtcStatus) => {
  rtcStatus.value = status
}

// 更新IM状态
const updateImStatus = (status: ImStatus) => {
  imStatus.value = status
}

// 暴露方法给父组件
defineExpose({
  updateRtcStatus,
  updateImStatus
})
</script>

<style scoped>
.live-container {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background-color: #000;
}

/* RTC层 - 最底层 */
.rtc-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
}

/* 弹幕层 - 中层 */
.danmaku-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 20;
  pointer-events: none;
  /* 不阻挡底层交互 */
}

/* 控制层 - 顶部 */
.control-layer-top {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 110;
  pointer-events: none;
  /* 默认不阻挡交互，子元素可单独开启 */
}

/* 顶部操作栏 */
.top-actions {
  position: relative;
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
  pointer-events: auto;
}

/* 状态信息栏 - 与操作栏在同一容器但另起一行 */
.status-bar {
  width: 100%;
  padding: 0 10px 10px;
  box-sizing: border-box;
  pointer-events: auto;
  margin-top: 10%;
}

.status-bar .status-info {
  display: inline-flex;
  flex-direction: column;
  gap: 5px;
  background-color: rgba(0, 0, 0, 0.7);
  padding: 8px 12px;
  border-radius: 8px;
  color: white;
  font-size: 12px;
}

/* 控制层 - 底部 */
.control-layer {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 100;
  pointer-events: auto;
  /* 允许交互 */
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-weight: bold;
}

.status-value {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.status-value.connected {
  background-color: #4caf50;
  color: white;
}

.status-value.disconnected {
  background-color: #f44336;
  color: white;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .top-actions {
    padding: 8px;
  }

  .status-bar {
    padding: 0 8px 8px;
  }

  .status-bar .status-info {
    padding: 6px 10px;
    font-size: 10px;
  }

  .status-item {
    gap: 5px;
  }

  .status-label {
    font-size: 11px;
  }
}
</style>