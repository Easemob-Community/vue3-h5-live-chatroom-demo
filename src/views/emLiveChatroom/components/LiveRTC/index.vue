<template>
  <div class="live-rtc-container">
    <!-- 
      ==================== 主播视图 ====================
      主播看到：
      1. 自己的摄像头画面（全屏大画面）
      2. 连麦观众的小窗（右上角）
    -->
    <template v-if="isHost">
      <!-- 主播本地视频预览 -->
      <div v-if="localVideoTrack" class="host-video-wrapper">
        <video ref="localVideoRef" class="host-video" autoplay muted playsinline></video>
      </div>

      <!-- 连麦观众的小窗视频 -->
      <div v-if="remoteUsers.length > 0" class="remote-videos-container host-remote">
        <div v-for="user in remoteUsers" :key="user.uid" class="remote-video-wrapper small">
          <video :ref="el => setRemoteVideoRef(user.uid, el as HTMLVideoElement)" 
                 class="remote-video" autoplay playsinline></video>
        </div>
      </div>
    </template>

    <!-- 
      ==================== 观众视图 ====================
      观众看到：
      1. 主播的视频画面（全屏大画面）
    -->
    <template v-else>
      <div class="remote-videos-container audience-remote">
        <div v-for="user in remoteUsers" :key="user.uid" class="remote-video-wrapper large">
          <video :ref="el => setRemoteVideoRef(user.uid, el as HTMLVideoElement)" 
                 class="remote-video" autoplay playsinline></video>
        </div>
      </div>
    </template>

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
/**
 * LiveRTC 组件 - 声网音视频直播核心组件
 * 
 * 【功能说明】
 * 1. 主播：开启摄像头和麦克风，推送视频流到服务器
 * 2. 观众：接收主播视频流，显示在页面上
 * 
 * 【使用流程】
 * 1. 父组件调用 initRTC() - 初始化 RTC 客户端
 * 2. 父组件调用 joinChannel() - 加入频道
 * 3. 组件自动处理音视频流的推拉
 * 4. 离开页面时调用 destroy() - 释放资源
 */
import { ref, reactive, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import AgoraRTC, {
  type IAgoraRTCClient,
  type ClientRole,
  type ICameraVideoTrack,
  type IMicrophoneAudioTrack,
} from 'agora-rtc-sdk-ng'
import { EMClient } from '@/easeim'
import type { LiveRtcProps, LiveRtcEmits, RtcState, RtcUser } from './types'

// ============================================
// 1. 配置和状态
// ============================================

// 接收父组件传入的参数
const props = withDefaults(defineProps<LiveRtcProps>(), {
  role: 'audience',    // 默认是观众
  videoEnabled: true,  // 默认开启视频
  audioEnabled: true,  // 默认开启音频
})

// 向父组件发送事件
const emit = defineEmits<LiveRtcEmits>()

// 计算属性：是否为主播
const isHost = computed(() => props.role === 'host')

// 页面状态
const state = reactive<RtcState>({
  joined: false,       // 是否已加入频道
  channelId: null,     // 当前频道ID
  localUid: null,      // 本地用户ID
  remoteUsers: [],     // 远程用户列表
  joining: false,      // 是否正在加入
  error: null,         // 错误信息
})

// ============================================
// 2. RTC 相关变量
// ============================================

const rtcClient = ref<IAgoraRTCClient | null>(null)           // Agora 客户端实例
const agoraAppId = ref<string | null>(null)                   // Agora App ID
const agoraUid = ref<number | null>(null)                     // Agora 用户ID
const agoraToken = ref<string | null>(null)                   // Agora Token
const localAudioTrack = ref<IMicrophoneAudioTrack | null>(null)   // 本地音频轨道（麦克风）
const localVideoTrack = ref<ICameraVideoTrack | null>(null)       // 本地视频轨道（摄像头）

// 视频元素引用
const localVideoRef = ref<HTMLVideoElement | null>(null)      // 本地视频元素
const remoteVideoRefs = ref<Record<string, HTMLVideoElement | null>>({})
const remoteUsers = ref<RtcUser[]>([])                        // 远程用户列表
const playedVideoTracks = ref<Set<string>>(new Set())         // 已播放的视频轨道（防重复）

// watch 监听器清理函数
let unwatchChannel: (() => void) | null = null

// ============================================
// 3. 核心方法 - 初始化
// ============================================

/**
 * 初始化 RTC 客户端
 * 
 * 【流程】
 * 1. 创建 Agora 客户端（直播模式）
 * 2. 设置角色（主播/观众）
 * 3. 如果是主播，创建本地音视频轨道（开启摄像头和麦克风）
 * 
 * 【注意】主播会在这里请求摄像头和麦克风权限
 */
const initRTC = async () => {
  try {
    console.log('[LiveRTC] 开始初始化，角色:', props.role)
    
    // 创建 Agora 客户端
    rtcClient.value = AgoraRTC.createClient({ 
      mode: 'live',     // 直播模式
      codec: 'h264'     // 视频编码格式
    })
    
    // 设置角色（主播可以推流，观众只能收流）
    await rtcClient.value.setClientRole(props.role)
    
    // 注册事件监听
    rtcClient.value.on('user-published', handleUserPublished)
    rtcClient.value.on('user-unpublished', handleUserUnpublished)
    
    console.log('[LiveRTC] RTC 客户端创建成功')

    // 如果是主播，创建本地音视频轨道
    if (isHost.value) {
      await createLocalTracks()
    }
  } catch (error) {
    handleError(error as Error)
    throw error
  }
}

/**
 * 创建本地音视频轨道（仅主播使用）
 * 
 * 【会触发浏览器权限请求】
 * - 麦克风权限
 * - 摄像头权限
 */
const createLocalTracks = async () => {
  try {
    console.log('[LiveRTC] 正在请求摄像头和麦克风权限...')
    
    // 创建音频轨道（麦克风）
    localAudioTrack.value = await AgoraRTC.createMicrophoneAudioTrack()
    console.log('[LiveRTC] ✅ 麦克风已开启')

    // 创建视频轨道（摄像头）
    localVideoTrack.value = await AgoraRTC.createCameraVideoTrack({
      encoderConfig: '480p_1',  // 视频分辨率 480p
    })
    console.log('[LiveRTC] ✅ 摄像头已开启')
  } catch (error) {
    console.error('[LiveRTC] ❌ 开启摄像头/麦克风失败:', error)
    throw error
  }
}

// ============================================
// 4. 核心方法 - 加入/离开频道
// ============================================

/**
 * 加入 RTC 频道
 * 
 * 【流程】
 * 1. 通过环信 IM 获取 Agora Token
 * 2. 加入频道
 * 3. 主播：发布本地音视频流
 */
const joinChannel = async () => {
  if (state.joined || state.joining) return

  state.joining = true
  state.error = null

  try {
    // 获取 Token
    const token = await getAccessToken()
    if (!token) throw new Error('获取 RTC Token 失败')

    if (!rtcClient.value) throw new Error('RTC 客户端未初始化')

    // 加入频道
    await rtcClient.value.join(token, props.channelName, null, agoraUid.value!)
    
    state.joined = true
    state.channelId = props.channelName
    state.localUid = agoraUid.value

    console.log('[LiveRTC] ✅ 已加入频道:', props.channelName, 'UID:', agoraUid.value)

    // 主播：发布本地音视频流并开始预览
    if (isHost.value) {
      await publishLocalTracks()
      
      // 延迟播放本地视频（确保 DOM 已渲染）
      setTimeout(() => {
        if (localVideoRef.value && localVideoTrack.value) {
          playLocalVideo(localVideoRef.value)
        }
      }, 200)
    }

    emit('joined', props.channelName, agoraUid.value || 0)
  } catch (error) {
    handleError(error as Error)
  } finally {
    state.joining = false
  }
}

/**
 * 获取 Agora RTC Token
 * 通过环信 IM SDK 获取（环信和 Agora 有集成）
 */
const getAccessToken = async (): Promise<string | null> => {
  try {
    const res = await EMClient.getRTCToken('*')
    if (!res?.data) return null

    agoraAppId.value = res.data.appId
    agoraUid.value = res.data.RTCUId
    agoraToken.value = res.data.RTCToken

    return agoraToken.value
  } catch (error) {
    console.error('[LiveRTC] 获取 Token 失败:', error)
    return null
  }
}

/**
 * 发布本地音视频流（主播调用）
 */
const publishLocalTracks = async () => {
  if (!rtcClient.value) return
  
  if (localAudioTrack.value && localVideoTrack.value) {
    await rtcClient.value.publish([localAudioTrack.value, localVideoTrack.value])
    console.log('[LiveRTC] ✅ 已发布音视频流到服务器')
  }
}

/**
 * 取消发布本地音视频流
 */
const unpublishLocalTracks = async () => {
  if (!rtcClient.value) return
  
  try {
    const tracks = [localAudioTrack.value, localVideoTrack.value].filter(Boolean) as any[]
    if (tracks.length > 0) {
      await rtcClient.value.unpublish(tracks)
      console.log('[LiveRTC] 已取消发布本地流')
    }
  } catch (error) {
    // 可能已未发布，忽略错误
  }
}

/**
 * 停止本地音视频轨道
 * 
 * 【关键】这是释放摄像头和麦克风的步骤
 */
const stopLocalTracks = async () => {
  // 停止音频轨道
  if (localAudioTrack.value) {
    localAudioTrack.value.stop()   // 停止采集
    localAudioTrack.value.close()  // 释放资源
    localAudioTrack.value = null
    console.log('[LiveRTC] 麦克风已关闭')
  }
  
  // 停止视频轨道
  if (localVideoTrack.value) {
    localVideoTrack.value.stop()
    localVideoTrack.value.close()
    localVideoTrack.value = null
    console.log('[LiveRTC] 摄像头已关闭')
  }
}

/**
 * 离开 RTC 频道
 */
const leaveChannel = async () => {
  if (!state.joined) return

  try {
    // 1. 取消发布
    await unpublishLocalTracks()
    
    // 2. 关闭摄像头和麦克风 ⭐ 关键步骤
    await stopLocalTracks()

    // 3. 离开频道
    if (rtcClient.value) {
      await rtcClient.value.leave()
    }

    // 4. 重置状态
    state.joined = false
    state.channelId = null
    state.localUid = null
    remoteUsers.value = []
    playedVideoTracks.value.clear()
    
    emit('left')
    console.log('[LiveRTC] 已离开频道')
  } catch (error) {
    handleError(error as Error)
  }
}

/**
 * 完全销毁 RTC 实例（页面离开时调用）
 */
const destroy = async () => {
  console.log('[LiveRTC] 开始销毁实例...')
  
  // 1. 离开频道，释放资源
  await leaveChannel()
  
  // 2. 移除事件监听
  if (rtcClient.value) {
    rtcClient.value.off('user-published', handleUserPublished)
    rtcClient.value.off('user-unpublished', handleUserUnpublished)
  }
  
  // 3. 清空引用
  rtcClient.value = null
  
  // 4. 清理 watch
  if (unwatchChannel) {
    unwatchChannel()
    unwatchChannel = null
  }
  
  console.log('[LiveRTC] 实例已销毁')
}

// ============================================
// 5. 视频播放相关
// ============================================

/**
 * 播放本地视频（主播预览自己的画面）
 */
const playLocalVideo = (element: HTMLVideoElement) => {
  if (!localVideoTrack.value) return

  try {
    localVideoTrack.value.play(element)
  } catch (error) {
    console.error('[LiveRTC] 播放本地视频失败:', error)
  }
}

/**
 * 设置远程视频元素的引用
 */
const setRemoteVideoRef = (uid: string, el: HTMLVideoElement | null) => {
  if (el) remoteVideoRefs.value[uid] = el
}

// ============================================
// 6. 事件处理
// ============================================

/**
 * 当有用户发布音视频流时触发
 * 
 * 【流程】
 * 1. 订阅该用户的流
 * 2. 在页面上播放
 */
const handleUserPublished = async (user: any, mediaType: 'audio' | 'video') => {
  try {
    console.log(`[LiveRTC] 用户 ${user.uid} 发布了 ${mediaType} 流`)

    // 订阅远端流
    await rtcClient.value?.subscribe(user, mediaType)

    // 保存用户状态
    updateRemoteUserState(user, mediaType, true)

    // 等待 DOM 更新
    await nextTick()

    // 播放视频
    if (mediaType === 'video' && user.videoTrack) {
      playRemoteVideo(user)
    }

    // 播放音频（音频不需要 DOM 元素，直接播放）
    if (mediaType === 'audio' && user.audioTrack) {
      user.audioTrack.play()
    }

    emit('userPublished', user, mediaType)
  } catch (error) {
    console.error('[LiveRTC] 处理用户发布流失败:', error)
  }
}

/**
 * 播放远程用户视频
 */
const playRemoteVideo = (user: any) => {
  const trackId = `${user.uid}_video`
  
  // 防重复播放
  if (playedVideoTracks.value.has(trackId)) return

  // 多次尝试获取视频元素
  let retryCount = 0
  const tryPlay = () => {
    const videoEl = remoteVideoRefs.value[user.uid]
    if (videoEl) {
      try {
        if (!user.videoTrack.isPlaying) {
          user.videoTrack.play(videoEl)
          playedVideoTracks.value.add(trackId)
          console.log(`[LiveRTC] 开始播放用户 ${user.uid} 的视频`)
        }
      } catch (error) {
        console.error(`[LiveRTC] 播放视频失败:`, error)
      }
    } else if (retryCount < 5) {
      retryCount++
      setTimeout(tryPlay, 100)
    }
  }
  tryPlay()
}

/**
 * 更新远程用户状态
 */
const updateRemoteUserState = (user: any, mediaType: string, isActive: boolean) => {
  const existingUser = remoteUsers.value.find(u => u.uid === user.uid)
  if (existingUser) {
    if (mediaType === 'audio') existingUser.hasAudio = isActive
    if (mediaType === 'video') existingUser.hasVideo = isActive
  } else {
    remoteUsers.value.push({
      uid: user.uid,
      hasAudio: mediaType === 'audio',
      hasVideo: mediaType === 'video',
      audioTrack: mediaType === 'audio' ? user.audioTrack : undefined,
      videoTrack: mediaType === 'video' ? user.videoTrack : undefined
    })
  }
}

/**
 * 当用户停止发布流时触发
 */
const handleUserUnpublished = (user: any, mediaType: 'audio' | 'video') => {
  updateRemoteUserState(user, mediaType, false)
  
  if (mediaType === 'video') {
    playedVideoTracks.value.delete(`${user.uid}_video`)
  }
  
  emit('userUnpublished', user, mediaType)
}

const handleError = (error: Error) => {
  state.error = error.message
  emit('error', error)
  console.error('[LiveRTC] 错误:', error)
}

const retryConnection = () => {
  state.error = null
  joinChannel()
}

// ============================================
// 7. 生命周期
// ============================================

onMounted(() => {
  console.log('[LiveRTC] 组件已挂载，等待父组件调用 initRTC')
})

onUnmounted(async () => {
  console.log('[LiveRTC] 组件卸载，清理资源')
  await destroy()
})

// 监听频道变化（切换频道时自动重新加入）
unwatchChannel = watch(() => props.channelName, async (newChannel) => {
  if (state.joined && newChannel !== state.channelId) {
    await leaveChannel()
    await joinChannel()
  }
})

// ============================================
// 8. 暴露给父组件的方法
// ============================================

defineExpose({
  initRTC,      // 初始化
  joinChannel,  // 加入频道
  leaveChannel, // 离开频道
  destroy,      // 完全销毁
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
