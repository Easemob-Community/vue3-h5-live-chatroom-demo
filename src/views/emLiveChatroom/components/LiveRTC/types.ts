import type { ClientRole, ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng'
import type { Ref } from 'vue'
import type { EasemobChat } from '@/easeim'

/**
 * RTC组件属性配置
 */
export interface LiveRtcProps {
  /** RTC频道名称 */
  channelName: string
  /** 用户ID */
  userId: string
  /** Agora App ID */
  appId?: string
  /** RTC Token */
  token?: string
  /** 客户端角色 */
  role?: ClientRole
  /** 是否自动加入频道 */
  autoJoin?: boolean
  /** 视频是否启用 */
  videoEnabled?: boolean
  /** 音频是否启用 */
  audioEnabled?: boolean
}

/**
 * RTC组件事件
 */
export interface LiveRtcEmits {
  /** 加入频道成功 */
  (e: 'joined', channelId: string, uid: string): void
  /** 离开频道 */
  (e: 'left'): void
  /** 错误事件 */
  (e: 'error', error: Error): void
  /** 用户发布流 */
  (e: 'user-published', user: any, mediaType: 'audio' | 'video'): void
  /** 用户取消发布流 */
  (e: 'user-unpublished', user: any, mediaType: 'audio' | 'video'): void
}

/**
 * RTC用户信息
 */
export interface RtcUser {
  /** 用户UID */
  uid: string
  /** 是否已发布音频 */
  hasAudio: boolean
  /** 是否已发布视频 */
  hasVideo: boolean
  /** 音频轨道 */
  audioTrack?: any
  /** 视频轨道 */
  videoTrack?: any
}

/**
 * RTC状态管理
 */
export interface RtcState {
  /** 是否已加入频道 */
  joined: boolean
  /** 当前频道ID */
  channelId: string | null
  /** 本地用户ID */
  localUid: string | null
  /** 远程用户列表 */
  remoteUsers: RtcUser[]
  /** 是否正在加入 */
  joining: boolean
  /** 错误信息 */
  error: string | null
}

/**
 * LiveRTC组件暴露的方法
 */
export interface LiveRtcExpose {
  /** 初始化RTC客户端 */
  initRTC: () => Promise<void>
  /** 加入RTC频道 */
  joinChannel: () => Promise<void>
  /** 离开RTC频道 */
  leaveChannel: (cleanupVideoElement?: () => void) => Promise<void>
  /** 获取RTC状态 */
  getState: () => {
    joined: boolean
    channelId: string | null
    localUid: string | null
    remoteUsers: RtcUser[]
    joining: boolean
    error: string | null
  }
}

/**
 * useRTC Hook 配置选项
 */
export interface UseRTCOptions {
  /** RTC频道名称 */
  channelName: string
  /** 客户端角色（主播/观众） */
  role: ClientRole
  /** 环信聊天客户端实例（用于获取RTC Token） */
  chatClient: EasemobChat.Connection
  /** 是否自动加入频道 */
  autoJoin?: boolean
}

/**
 * useRTC Hook 返回类型
 */
export interface UseRTCReturn {
  /** RTC状态 */
  state: RtcState
  /** 本地视频轨道 */
  localVideoTrack: Ref<ICameraVideoTrack | null>
  /** 本地音频轨道 */
  localAudioTrack: Ref<IMicrophoneAudioTrack | null>
  /** 远程用户列表 */
  remoteUsers: Ref<RtcUser[]>
  /** 步骤1：初始化RTC客户端 */
  initRTC: () => Promise<void>
  /** 步骤2：挂载事件监听器 */
  setupEventListeners: () => void
  /** 步骤3：获取RTC访问Token */
  getAccessToken: () => Promise<string | null>
  /** 步骤4：加入RTC频道 */
  joinChannel: () => Promise<void>
  /** 步骤5：发布本地音视频流（主播专用） */
  publishTracks: () => Promise<void>
  /** 关闭本地音视频轨道 */
  closeLocalTracks: (cleanupVideoElement?: () => void) => Promise<void>
  /** 播放本地视频预览 */
  playLocalVideo: (element: HTMLVideoElement) => void
  /** 离开RTC频道 */
  leaveChannel: (cleanupVideoElement?: () => void) => Promise<void>
  /** 获取Agora客户端实例 */
  getClient: () => any
}