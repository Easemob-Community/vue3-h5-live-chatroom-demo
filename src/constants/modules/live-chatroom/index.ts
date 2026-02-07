import type { LiveChatroomConfig } from './types';

/**
 * 直播间配置
 * 根据实际需求修改对应的配置值
 */
export const liveChatroomConfig: LiveChatroomConfig = {
  // 用户配置
  user: {
    userId: 'hfp',           // 默认用户ID
    password: '1',            // 用户密码（如果需要）
    accessToken: 'YWMtfJ_d2APNEfGhBBd24LlWQA1mN7fFQUJHtJstEOESXXmHDDbg4kkR8IkXadRFfn-ZAwMAAAGcNfMgUjeeSABsXZKgohUTmnf3W2KpMhc2o8RFEPFAGiiqhS-w2miHcA'          // 访问令牌（如果使用token认证）
  },
  
  // 聊天室配置
  chatrooms: {
    // 信令聊天室
    signaling: {
      roomId: '302300982738945',    // 信令聊天室ID
      roomName: '信令直播间'           // 聊天室名称
    },
    // 互动聊天室
    interactive: {
      roomId: '302300629368836',  // 互动聊天室ID
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

// 导出配置供直接使用
export default liveChatroomConfig;