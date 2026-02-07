/**
 * 直播间配置相关类型定义
 */

/**
 * 用户登录配置
 */
export interface UserConfig {
  /** 用户ID */
  userId: string;
  /** 用户密码 */
  password: string;
  /** 访问令牌（可选） */
  accessToken?: string;
}

/**
 * 聊天室配置
 */
export interface ChatroomConfig {
  /** 聊天室ID */
  roomId: string;
  /** 聊天室名称 */
  roomName?: string;
}

/**
 * RTC配置
 */
export interface RtcConfig {
  /** RTC频道名称 */
  channelName: string;
  /** RTC应用ID */
  appId?: string;
}

/**
 * 环信IM配置
 */
export interface ImConfig {
  /** 环信应用Key */
  appKey: string;
  /** API服务器地址 */
  apiUrl?: string;
  /** WebSocket服务器地址 */
  wsUrl?: string;
}

/**
 * 完整的直播间配置
 */
export interface LiveChatroomConfig {
  /** 用户配置 */
  user: UserConfig;
  /** 聊天室配置 */
  chatrooms: {
    /** 信令聊天室 */
    signaling: ChatroomConfig;
    /** 互动聊天室 */
    interactive: ChatroomConfig;
  };
  /** RTC配置 */
  rtc: RtcConfig;
  /** 环信IM配置 */
  im: ImConfig;
  /** 配置名称标识 */
  configName?: string;
  /** 环境标识 */
  env?: 'development' | 'production' | 'test';
}