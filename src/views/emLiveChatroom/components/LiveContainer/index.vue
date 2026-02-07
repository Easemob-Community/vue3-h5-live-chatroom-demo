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

    <!-- 顶层：控制层 -->
    <div class="control-layer">
      <slot name="control"></slot>
    </div>

    <!-- 全局状态显示 -->
    <div v-if="showStatus" class="status-overlay">
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

/* 控制层 - 顶层 */
.control-layer {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 100;
  pointer-events: auto;
  /* 允许交互 */
}

/* 状态显示层 */
.status-overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 50;
  background-color: rgba(0, 0, 0, 0.7);
  padding: 10px;
  border-radius: 8px;
  color: white;
  font-size: 12px;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 5px;
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
  .status-overlay {
    top: 5px;
    left: 5px;
    padding: 8px;
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