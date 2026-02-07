import type { ClientRole } from 'agora-rtc-sdk-ng'

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