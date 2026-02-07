<template>
  <div class="live-rtc-container">
    <!-- 本地视频预览 -->
    <div v-if="localVideoTrack" class="local-video-wrapper">
      <video ref="localVideoRef" class="local-video" autoplay muted></video>
    </div>

    <!-- 远程视频容器 -->
    <div class="remote-videos-container">
      <div v-for="user in remoteUsers" :key="user.uid" class="remote-video-wrapper">
        <video :ref="el => setRemoteVideoRef(user.uid, el as HTMLVideoElement)" class="remote-video" autoplay></video>
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
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { LiveRTC } from '@/easeim/live-rtc'
import { EMClient } from '@/easeim'
import type { ClientRole } from 'agora-rtc-sdk-ng'
import type { LiveRtcProps, LiveRtcEmits, RtcState, RtcUser } from './types'

// 定义组件属性和事件
const props = withDefaults(defineProps<LiveRtcProps>(), {
  role: 'audience',
  autoJoin: true,
  videoEnabled: true,
  audioEnabled: true
})

const emit = defineEmits<LiveRtcEmits>()

// 组件状态
const state = reactive<RtcState>({
  joined: false,
  channelId: null,
  localUid: null,
  remoteUsers: [],
  joining: false,
  error: null
})

// RTC实例
const liveRTC = new LiveRTC(EMClient)

// 视频引用
const localVideoRef = ref<HTMLVideoElement | null>(null)
const remoteVideoRefs = ref<Record<string, HTMLVideoElement | null>>({})
const localVideoTrack = ref<any>(null)

// 远程用户管理
const remoteUsers = ref<RtcUser[]>([])

// 设置远程视频引用
const setRemoteVideoRef = (uid: string, el: HTMLVideoElement | null) => {
  if (el) {
    remoteVideoRefs.value[uid] = el
    // 如果已经有对应的用户流，立即播放
    const user = remoteUsers.value.find(u => u.uid === uid)
    if (user?.videoTrack && !user.videoTrack.isPlaying) {
      user.videoTrack.play(el)
    }
  }
}

// 初始化RTC客户端
const initRTC = async () => {
  try {
    await liveRTC.initRTC(props.role)
    console.log('RTC初始化成功')
  } catch (error) {
    handleError(error as Error)
  }
}

// 加入频道
const joinChannel = async () => {
  if (state.joined || state.joining) return

  state.joining = true
  state.error = null

  try {
    // 获取RTC Token
    const token = await liveRTC.getAccessToken(EMClient)
    if (!token) {
      throw new Error('获取RTC Token失败')
    }

    // 生成随机UID（实际项目中应该从服务端获取）
    const uid = Math.floor(Math.random() * 1000000).toString()

    // 加入频道
    await liveRTC.joinRTC(props.channelName, uid, token)
    state.joined = true
    state.channelId = props.channelName
    state.localUid = uid

    emit('joined', props.channelName, uid)
    console.log('成功加入RTC频道:', props.channelName)

  } catch (error) {
    handleError(error as Error)
  } finally {
    state.joining = false
  }
}

// 离开频道
const leaveChannel = async () => {
  if (!state.joined) return

  try {
    await liveRTC.leaveRTC()
    state.joined = false
    state.channelId = null
    state.localUid = null
    remoteUsers.value = []
    emit('left')
    console.log('离开RTC频道')
  } catch (error) {
    handleError(error as Error)
  }
}

// 处理错误
const handleError = (error: Error) => {
  state.error = error.message
  emit('error', error)
  console.error('RTC错误:', error)
}

// 重试连接
const retryConnection = () => {
  state.error = null
  joinChannel()
}

// 监听用户发布流
const handleUserPublished = async (user: any, mediaType: 'audio' | 'video') => {
  try {
    // 订阅远端用户
    await liveRTC.getClient()?.subscribe(user, mediaType)

    // 更新用户状态
    const existingUser = remoteUsers.value.find(u => u.uid === user.uid)
    if (existingUser) {
      if (mediaType === 'audio') existingUser.hasAudio = true
      if (mediaType === 'video') existingUser.hasVideo = true
    } else {
      remoteUsers.value.push({
        uid: user.uid,
        hasAudio: mediaType === 'audio',
        hasVideo: mediaType === 'video',
        audioTrack: mediaType === 'audio' ? user.audioTrack : undefined,
        videoTrack: mediaType === 'video' ? user.videoTrack : undefined
      })
    }

    // 播放媒体流
    if (mediaType === 'video' && user.videoTrack) {
      const videoEl = remoteVideoRefs.value[user.uid]
      if (videoEl && !user.videoTrack.isPlaying) {
        user.videoTrack.play(videoEl)
      }
    }

    if (mediaType === 'audio' && user.audioTrack) {
      user.audioTrack.play()
    }

    emit('user-published', user, mediaType)

  } catch (error) {
    handleError(error as Error)
  }
}

// 监听用户取消发布流
const handleUserUnpublished = (user: any, mediaType: 'audio' | 'video') => {
  // 更新用户状态
  const existingUser = remoteUsers.value.find(u => u.uid === user.uid)
  if (existingUser) {
    if (mediaType === 'audio') existingUser.hasAudio = false
    if (mediaType === 'video') existingUser.hasVideo = false
  }

  emit('user-unpublished', user, mediaType)
}

// 组件挂载
onMounted(async () => {
  try {
    // 初始化RTC
    await initRTC()

    // 设置事件监听
    const client = liveRTC.getClient()
    if (client) {
      client.on('user-published', handleUserPublished)
      client.on('user-unpublished', handleUserUnpublished)
    }

    // 自动加入频道
    if (props.autoJoin) {
      await joinChannel()
    }
  } catch (error) {
    handleError(error as Error)
  }
})

// 组件卸载
onUnmounted(async () => {
  await leaveChannel()

  // 清理事件监听
  const client = liveRTC.getClient()
  if (client) {
    client.off('user-published', handleUserPublished)
    client.off('user-unpublished', handleUserUnpublished)
  }
})

// 监听属性变化
watch(() => props.channelName, async (newChannel) => {
  if (state.joined && newChannel !== state.channelId) {
    await leaveChannel()
    await joinChannel()
  }
})

// 暴露方法给父组件
defineExpose({
  joinChannel,
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

.local-video-wrapper {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 120px;
  height: 90px;
  z-index: 15;
  border: 2px solid #fff;
  border-radius: 8px;
  overflow: hidden;
}

.local-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remote-videos-container {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 10px;
  padding: 10px;
  box-sizing: border-box;
}

.remote-video-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: #333;
  border-radius: 8px;
  overflow: hidden;
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