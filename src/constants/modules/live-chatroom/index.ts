import type { LiveChatroomConfig } from './types';

/**
 * 默认直播间配置
 * 根据实际需求修改对应的配置值
 */
export const defaultLiveChatroomConfig: LiveChatroomConfig = {
  configName: '默认直播间配置',
  env: 'development',
  
  // 用户配置
  user: {
    userId: 'hfp',           // 默认用户ID
    password: '',            // 用户密码（如果需要）
    accessToken: ''          // 访问令牌（如果使用token认证）
  },
  
  // 聊天室配置
  chatrooms: {
    // 信令聊天室
    signaling: {
      roomId: 'signaling_room_id',    // 信令聊天室ID
      roomName: '信令直播间'           // 聊天室名称
    },
    // 互动聊天室
    interactive: {
      roomId: 'interactive_room_id',  // 互动聊天室ID
      roomName: '互动直播间'           // 聊天室名称
    }
  },
  
  // RTC配置
  rtc: {
    channelName: 'live_channel_001',   // RTC频道名称
    appId: ''                          // Agora App ID（如果需要单独配置）
  },
  
  // 环信IM配置
  im: {
    appKey: 'easemob-demo#support',    // 环信应用Key
    apiUrl: 'https://a1.easemob.com',  // API服务器地址
    wsUrl: 'wss://im-api.easemob.com/ws' // WebSocket服务器地址
  }
};

/**
 * 多套配置示例（可以根据需要扩展）
 */
export const liveChatroomConfigs: Record<string, LiveChatroomConfig> = {
  // 开发环境配置
  development: {
    ...defaultLiveChatroomConfig,
    configName: '开发环境配置',
    env: 'development',
    user: {
      userId: 'dev_user_001',
      password: 'dev_password',
      accessToken: ''
    },
    chatrooms: {
      signaling: {
        roomId: 'dev_signaling_room',
        roomName: '开发信令直播间'
      },
      interactive: {
        roomId: 'dev_interactive_room',
        roomName: '开发互动直播间'
      }
    },
    rtc: {
      channelName: 'dev_live_channel',
      appId: ''
    }
  },
  
  // 生产环境配置
  production: {
    ...defaultLiveChatroomConfig,
    configName: '生产环境配置',
    env: 'production',
    user: {
      userId: 'prod_user_001',
      password: 'prod_password',
      accessToken: ''
    },
    chatrooms: {
      signaling: {
        roomId: 'prod_signaling_room',
        roomName: '生产信令直播间'
      },
      interactive: {
        roomId: 'prod_interactive_room',
        roomName: '生产互动直播间'
      }
    },
    rtc: {
      channelName: 'prod_live_channel',
      appId: ''
    }
  }
};

/**
 * 获取当前环境的配置
 * @returns 当前环境的直播间配置
 */
export function getCurrentLiveChatroomConfig(): LiveChatroomConfig {
  const env = process.env.NODE_ENV || 'development';
  return liveChatroomConfigs[env] || defaultLiveChatroomConfig;
}

/**
 * 根据配置名称获取特定配置
 * @param configName 配置名称
 * @returns 对应的配置对象
 */
export function getLiveChatroomConfigByName(configName: string): LiveChatroomConfig {
  return liveChatroomConfigs[configName] || defaultLiveChatroomConfig;
}

/**
 * 验证配置是否完整
 * @param config 要验证的配置
 * @returns 验证结果和缺失字段
 */
export function validateLiveChatroomConfig(config: LiveChatroomConfig): {
  isValid: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];
  
  // 验证必填字段
  if (!config.user.userId) {
    missingFields.push('user.userId');
  }
  
  if (!config.chatrooms.signaling.roomId) {
    missingFields.push('chatrooms.signaling.roomId');
  }
  
  if (!config.chatrooms.interactive.roomId) {
    missingFields.push('chatrooms.interactive.roomId');
  }
  
  if (!config.rtc.channelName) {
    missingFields.push('rtc.channelName');
  }
  
  if (!config.im.appKey) {
    missingFields.push('im.appKey');
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

// 导出默认配置供直接使用
export default defaultLiveChatroomConfig;