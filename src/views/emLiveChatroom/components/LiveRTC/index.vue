<template>
  <div class="live-rtc-container">
    <!-- 主播：本地视频预览（大画面） -->
    <div v-if="isHost && localVideoTrack" class="host-video-wrapper">
      <video ref="localVideoRef" class="host-video" autoplay muted playsinline></video>
    </div>

    <!-- 主播：小窗预览远程观众（可选） -->
    <div v-if="isHost && remoteUsers.length > 0" class="remote-videos-container host-remote">
      <div v-for="user in remoteUsers" :key="user.uid" class="remote-video-wrapper small">
        <video :ref="el => setRemoteVideoRef(user.uid, el as HTMLVideoElement)" class="remote-video" autoplay
          playsinline></video>
      </div>
    </div>

    <!-- 观众：远程视频容器（大画面看主播） -->
    <div v-if="!isHost" class="remote-videos-container audience-remote">
      <div v-for="user in remoteUsers" :key="user.uid" class="remote-video-wrapper large">
        <video :ref="el => setRemoteVideoRef(user.uid, el as HTMLVideoElement)" class="remote-video" autoplay
          playsinline></video>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="state.joining" class="loading-overlay">
      <div class="loading-spinner">正在加入频道...</div>
    </div>

    <!-- 错误提示 -->
    <div v-if="state.error" class="error-overlay">
      <div class="error-message">{{ state.error }}</div>
      <button @click="retryConnection" class="retry-button">重试</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRTC } from './useRTC'
import { EMClient } from '@/easeim'
import type { LiveRtcProps, LiveRtcEmits } from './types'

// ==================== 组件属性和事件 ====================

const props = withDefaults(defineProps<LiveRtcProps>(), {
  role: 'audience',
  autoJoin: true,
  videoEnabled: true,
  audioEnabled: true
})

const emit = defineEmits<LiveRtcEmits>()

// ==================== 计算属性 ====================

// 是否为主播
const isHost = computed(() => props.role === 'host')

// ==================== 使用 useRTC Hook ====================

/**
 * 使用 useRTC Hook 封装 RTC 相关逻辑
 * 
 * 这个 Hook 提供了完整的 RTC 直播流程：
 * 1. initRTC - 初始化RTC客户端
 * 2. setupEventListeners - 挂载事件监听器
 * 3. joinChannel - 加入频道（内部获取Token）
 * 4. publishTracks - 发布音视频流（主播专用）
 * 5. playLocalVideo - 播放本地视频预览
 */
const {
  state,
  localVideoTrack,
  remoteUsers,
  initRTC,
  setupEventListeners,
  joinChannel,
  publishTracks,
  playLocalVideo,
  leaveChannel
} = useRTC({
  channelName: props.channelName,
  role: props.role,
  chatClient: EMClient,
  autoJoin: props.autoJoin
})

// ==================== 视频元素引用 ====================

// 本地视频元素引用（主播使用）
const localVideoRef = ref<HTMLVideoElement | null>(null)

// 远程视频元素引用（存储多个远程用户的video元素）
const remoteVideoRefs = ref<Record<string, HTMLVideoElement | null>>({})

/**
 * 设置远程视频元素引用
 * 当video元素创建时，自动播放对应用户的视频流
 */
const setRemoteVideoRef = (uid: string, el: HTMLVideoElement | null) => {
  if (el) {
    remoteVideoRefs.value[uid] = el
    // 如果已经有对应的用户流，立即播放
    const user = remoteUsers.value.find(u => u.uid === uid)
    if (user?.videoTrack && !user.videoTrack.isPlaying) {
      user.videoTrack.play(el)
    }
  } else {
    // 元素被销毁时，清理引用
    delete remoteVideoRefs.value[uid]
  }
}

/**
 * 清理所有远程视频元素
 * 停止播放并清空video元素的srcObject
 */
const cleanupRemoteVideos = () => {
  Object.entries(remoteVideoRefs.value).forEach(([uid, videoEl]) => {
    if (videoEl) {
      try {
        // 清空srcObject，释放媒体流
        if (videoEl.srcObject) {
          videoEl.srcObject = null
        }
        // 暂停播放
        videoEl.pause()
        console.log(`[LiveRTC] 清理远程用户 ${uid} 的video元素`)
      } catch (error) {
        console.warn(`[LiveRTC] 清理远程用户 ${uid} 的video元素时出错:`, error)
      }
    }
  })
  // 清空引用
  remoteVideoRefs.value = {}
}

// ==================== RTC 直播流程 ====================

/**
 * 完整的 RTC 直播流程示例
 * 
 * 此方法展示了如何按顺序调用 useRTC 提供的方法，
 * 完成从初始化到开始直播的完整流程
 * 
 * 流程步骤：
 * 1. 初始化 RTC 客户端
 * 2. 挂载事件监听器（监听远程用户的流变化）
 * 3. 加入 RTC 频道（内部会自动获取 Token）
 * 4. 如果是主播：
 *    a. 发布本地音视频流
 *    b. 播放本地视频预览
 * 5. 如果是观众：
 *    自动订阅主播的流（在 setupEventListeners 中处理）
 */
const startLiveStreaming = async () => {
  try {
    console.log('[LiveRTC] 开始启动直播流程')

    // 步骤 1: 初始化 RTC 客户端
    await initRTC()
    console.log('[LiveRTC] ✅ 步骤 1 完成: RTC客户端初始化成功')

    // 步骤 2: 挂载事件监听器
    setupEventListeners()
    console.log('[LiveRTC] ✅ 步骤 2 完成: 事件监听器已挂载')

    // 步骤 3-4: 加入频道（内部自动获取Token）
    await joinChannel()
    console.log('[LiveRTC] ✅ 步骤 3-4 完成: 成功加入频道')

    // 发出 joined 事件通知父组件
    emit('joined', props.channelName, state.localUid || '')

    // 步骤 5: 主播发布流
    if (isHost.value) {
      // 发布本地音视频流（遵循职责分离原则，由组件层显式调用）
      await publishTracks()
      console.log('[LiveRTC] ✅ 步骤 5 完成: 本地音视频流已发布')

      // 播放本地视频预览
      await nextTick()
      setTimeout(() => {
        if (localVideoRef.value && localVideoTrack.value) {
          playLocalVideo(localVideoRef.value)
          console.log('[LiveRTC] ✅ 本地视频预览已开始播放')
        } else {
          console.warn('[LiveRTC] ⚠️ 视频元素或轨道未就绪', {
            videoEl: localVideoRef.value,
            track: localVideoTrack.value
          })
        }
      }, 200)
    } else {
      console.log('[LiveRTC] 观众模式: 等待订阅主播流')
    }

    console.log('[LiveRTC] ✨ 直播流程启动完成')
  } catch (error) {
    console.error('[LiveRTC] 直播流程启动失败:', error)
    emit('error', error as Error)
  }
}

/**
 * 重试连接
 */
const retryConnection = () => {
  state.error = null
  startLiveStreaming()
}

// ==================== 生命周期钩子 ====================

/**
 * 组件挂载时：如果开启了 autoJoin，自动启动直播流程
 */
onMounted(() => {
  console.log('[LiveRTC] 组件已挂载, autoJoin:', props.autoJoin)
  // 注意：RTC初始化现在由父组件在IM连接成功后调用
  // 这里不自动启动，等待父组件调用 startLiveStreaming
})

/**
 * 组件卸载时：自动离开频道并发出 left 事件
 */
onUnmounted(async () => {
  console.log('[LiveRTC] 组件即将卸载，开始清理资源')

  // 离开RTC频道（传递video元素清理回调）
  if (state.joined) {
    await leaveChannel(() => {
      // 清理本地video元素
      if (localVideoRef.value) {
        try {
          if (localVideoRef.value.srcObject) {
            localVideoRef.value.srcObject = null
          }
          localVideoRef.value.pause()
          console.log('[LiveRTC] 本地video元素已清理')
        } catch (error) {
          console.warn('[LiveRTC] 清理本地video元素时出错:', error)
        }
      }

      // 清理远程video元素
      cleanupRemoteVideos()
    })
    emit('left')
  }

  console.log('[LiveRTC] 组件卸载清理完成')
})

// ==================== 暴露给父组件的方法 ====================

/**
 * 暴露给父组件的方法和状态
 * 父组件可以通过 ref 获取这些方法来控制 RTC
 */
defineExpose({
  initRTC,
  joinChannel: startLiveStreaming,  // 暴露完整流程
  leaveChannel,
  getState: () => ({ ...state })
})
</script>

<style scoped>
.live-rtc-container {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: #000;
  overflow: hidden;
}

/* 主播：本地视频大画面 */
.host-video-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  background-color: #000;
}

.host-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  min-width: 100px;
  min-height: 100px;
}

/* 主播：远程观众小窗 */
.remote-videos-container.host-remote {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 200px;
  height: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 20;
}

.remote-video-wrapper.small {
  width: 100%;
  height: 120px;
  background-color: #333;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid #fff;
}

/* 观众：远程视频大画面 */
.remote-videos-container.audience-remote {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;
}

.remote-video-wrapper.large {
  width: 100%;
  height: 100%;
  background-color: #333;
}

.remote-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 25;
}

.loading-spinner {
  color: white;
  font-size: 18px;
  padding: 20px;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
}

.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 25;
}

.error-message {
  color: #ff4444;
  font-size: 16px;
  margin-bottom: 20px;
  text-align: center;
  padding: 0 20px;
}

.retry-button {
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

.retry-button:hover {
  background-color: #0056b3;
}
</style>