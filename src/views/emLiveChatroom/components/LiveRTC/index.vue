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
      <button class="retry-button" @click="retryConnection">重试</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
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

// 计算属性：是否为主播
const isHost = computed(() => props.role === 'host')

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
const liveRTC = new LiveRTC(props.channelName as string)

// 视频引用
const localVideoRef = ref<HTMLVideoElement | null>(null)
const remoteVideoRefs = ref<Record<string, HTMLVideoElement | null>>({})
const localVideoTrack = ref<any>(null)

// 远程用户管理
const remoteUsers = ref<RtcUser[]>([])

// 记录已播放的视频轨道，避免重复播放
const playedVideoTracks = ref<Set<string>>(new Set())

// 设置远程视频引用
const setRemoteVideoRef = (uid: string, el: HTMLVideoElement | null) => {
  if (el) {
    remoteVideoRefs.value[uid] = el
    // 注意：不在这里播放视频，统一由 handleUserPublished 处理
    // 避免因为 ref 函数重复调用导致的死循环
  }
}

// 初始化RTC客户端
const initRTC = async () => {
  try {
    await liveRTC.initRTC(props.role)
    console.log('RTC初始化成功，角色:', props.role)

    // 设置事件监听（必须在client初始化后）
    const client = liveRTC.getClient()
    if (client) {
      client.on('user-published', handleUserPublished)
      client.on('user-unpublished', handleUserUnpublished)
      console.log('RTC事件监听器已注册')
    } else {
      console.error('无法获取RTC客户端,事件监听器未注册')
    }

    // 如果是主播，获取本地视频轨道并准备播放
    if (isHost.value) {
      const track = liveRTC.getLocalVideoTrack()
      if (track) {
        localVideoTrack.value = track
        console.log('主播本地视频轨道已创建')
      }
    }
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

    // 加入频道，使用 callback 在加入成功后发布流
    await liveRTC.joinRTC(async () => {
      state.joined = true
      state.channelId = props.channelName
      state.localUid = liveRTC.agoraUid

      // 如果是主播，先发布流，再播放本地视频
      if (isHost.value) {
        // 发布本地音视频流
        await liveRTC.publishLocalTracks()

        // 播放本地视频预览
        await nextTick()
        setTimeout(() => {
          if (localVideoRef.value && localVideoTrack.value) {
            liveRTC.playLocalVideo(localVideoRef.value)
            console.log('主播本地视频开始播放', localVideoRef.value)
          } else {
            console.warn('视频元素或轨道未就绪', {
              videoEl: localVideoRef.value,
              track: localVideoTrack.value
            })
          }
        }, 200)
      }

      const uid = liveRTC.agoraUid || ''
      emit('joined', props.channelName, uid)
      console.log('成功加入RTC频道:', props.channelName, '角色:', props.role, 'UID:', uid)
    })

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
    // 清空播放记录
    playedVideoTracks.value.clear()
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
    console.log(`远端用户 ${user.uid} 发布了 ${mediaType} 流`)

    // 订阅远端用户
    await liveRTC.getClient()?.subscribe(user, mediaType)
    console.log(`成功订阅用户 ${user.uid} 的 ${mediaType} 流`)

    // 更新用户状态
    let existingUser = remoteUsers.value.find(u => u.uid === user.uid)
    if (existingUser) {
      if (mediaType === 'audio') {
        existingUser.hasAudio = true
        existingUser.audioTrack = user.audioTrack
      }
      if (mediaType === 'video') {
        existingUser.hasVideo = true
        existingUser.videoTrack = user.videoTrack
      }
    } else {
      remoteUsers.value.push({
        uid: user.uid,
        hasAudio: mediaType === 'audio',
        hasVideo: mediaType === 'video',
        audioTrack: mediaType === 'audio' ? user.audioTrack : undefined,
        videoTrack: mediaType === 'video' ? user.videoTrack : undefined
      })
      existingUser = remoteUsers.value[remoteUsers.value.length - 1]
    }

    // 等待DOM更新后播放媒体流
    await nextTick()

    // 播放视频流
    if (mediaType === 'video' && user.videoTrack) {
      const trackId = `${user.uid}_video`

      // 检查是否已经播放过，避免重复播放
      if (playedVideoTracks.value.has(trackId)) {
        console.log(`用户 ${user.uid} 的视频已在播放中，跳过重复播放`)
        return
      }

      // 多次尝试获取视频元素,确保DOM已挂载
      let retryCount = 0
      const maxRetries = 5
      const tryPlayVideo = () => {
        const videoEl = remoteVideoRefs.value[user.uid]
        if (videoEl) {
          try {
            // 检查轨道是否已经在播放
            if (!user.videoTrack.isPlaying) {
              user.videoTrack.play(videoEl)
              playedVideoTracks.value.add(trackId)
              console.log(`成功播放用户 ${user.uid} 的视频流`)
            } else {
              console.log(`用户 ${user.uid} 的视频轨道已在播放`)
            }
          } catch (error) {
            console.error(`播放用户 ${user.uid} 视频失败:`, error)
            // 容错：使用srcObject方式
            const mediaStream = user.videoTrack.getMediaStreamTrack()
            if (mediaStream && videoEl) {
              const stream = new MediaStream([mediaStream])
              videoEl.srcObject = stream
              videoEl.play().catch(e => console.error('原生视频播放失败:', e))
              playedVideoTracks.value.add(trackId)
            }
          }
        } else if (retryCount < maxRetries) {
          retryCount++
          console.log(`视频元素未就绪，${100}ms后重试 (${retryCount}/${maxRetries})`)
          setTimeout(tryPlayVideo, 100)
        } else {
          console.error(`无法获取用户 ${user.uid} 的视频元素`)
        }
      }
      tryPlayVideo()
    }

    // 播放音频流
    if (mediaType === 'audio' && user.audioTrack) {
      user.audioTrack.play()
      console.log(`成功播放用户 ${user.uid} 的音频流`)
    }

    emit('user-published', user, mediaType)

  } catch (error) {
    console.error('订阅用户流失败:', error)
    handleError(error as Error)
  }
}

// 监听用户取消发布流
const handleUserUnpublished = (user: any, mediaType: 'audio' | 'video') => {
  // 更新用户状态
  const existingUser = remoteUsers.value.find(u => u.uid === user.uid)
  if (existingUser) {
    if (mediaType === 'audio') existingUser.hasAudio = false
    if (mediaType === 'video') {
      existingUser.hasVideo = false
      // 清除播放记录
      const trackId = `${user.uid}_video`
      playedVideoTracks.value.delete(trackId)
    }
  }

  emit('user-unpublished', user, mediaType)
}

// 组件挂载
onMounted(async () => {
  // 注意：RTC初始化和事件监听现在在 initRTC 方法中统一处理
  // initRTC 由父组件在IM连接成功后调用
  console.log('LiveRTC组件已挂载,等待父组件调用initRTC')
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

// 监听本地视频轨道变化，当轨道就绪且视频元素存在时自动播放
watch(localVideoTrack, async (track) => {
  if (track && isHost.value && localVideoRef.value && state.joined) {
    await nextTick()
    liveRTC.playLocalVideo(localVideoRef.value)
    console.log('监听到轨道变化，开始播放本地视频')
  }
})

// 暴露方法给父组件
defineExpose({
  initRTC,
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