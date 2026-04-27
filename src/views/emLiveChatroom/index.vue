<template>
  <LiveContainer ref="containerRef" :show-status="showStatus">
    <!-- RTC层插槽 -->
    <template #rtc>
      <LiveRTC ref="rtcRef" :channel-name="channelName" :user-id="userId" :role="rtcRole"
        @joined="handleRtcJoined" @left="handleRtcLeft" @error="handleRtcError" @user-published="handleUserPublished"
        @user-unpublished="handleUserUnpublished" />
    </template>

    <!-- 弹幕层插槽 -->
    <template #danmaku>
      <DanmakuComp :message-list="messageList" />
    </template>

    <!-- 点赞动画层插槽 -->
    <template #like-animation>
      <LikeAnimation
        ref="likeAnimationRef"
        :visible="showLikeAnimation"
        :report-api="handleLikeReport"
        @like-click="handleLocalLikeClick"
        @report-success="handleReportSuccess"
        @report-fail="handleReportFail"
      />
    </template>

    <!-- 顶部控制层插槽 -->
    <template #control-top>
      <!-- 返回首页按钮 -->
      <div class="home-btn" @click="goToHome">
        <van-icon name="wap-home-o" size="20" />
      </div>
      <!-- 角色标识 -->
      <div class="role-badge" :class="rtcRole === 'host' ? 'host' : 'audience'">
        {{ rtcRole === 'host' ? '主播' : '观众' }}
      </div>
      <!-- 大型模式标识 -->
      <div v-if="isLargeMode" class="mode-badge">
        大型模式
      </div>
      <!-- 修改配置按钮 -->
      <div class="config-btn" @click="goToConfig">
        <van-icon name="setting-o" size="20" />
      </div>
    </template>

    <!-- 底部控制层插槽 -->
    <template #control>
      <!-- 发送弹幕区域 -->
      <div class="send-danmaku-container">
        <input v-model.trim="messageContent" type="text" placeholder="输入弹幕内容" />
        <button v-if="isLargeMode" @click="sendMessageInLargeMode">发送</button>
        <button v-else @click="sendMessage">发送</button>
      </div>
    </template>
  </LiveContainer>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { showToast } from 'vant';
import DanmakuComp from './components/DanmakuList/index.vue';
import LiveRTC from './components/LiveRTC/index.vue';
import LiveContainer from './components/LiveContainer/index.vue';
import LikeAnimation from './components/LikeAnimation/index.vue';
import type { LiveRtcExpose } from './components/LiveRTC/types';
import { WebSDK, EMClient, EasemobChat } from '@/easeim';
import { liveChatroomConfig } from '@/constants';

// ============================================
// 配置加载
// ============================================
const STORAGE_KEY = 'live_chatroom_config';

/** 从 localStorage 加载用户配置 */
const loadConfig = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.error('读取本地配置失败', error);
  }
  return null;
};

// 合并配置（本地存储 + 默认配置）
const savedConfig = loadConfig();
const liveConfig = {
  user: {
    userId: savedConfig?.userId || liveChatroomConfig.user.userId,
    nickname: savedConfig?.nickname || liveChatroomConfig.user.nickname,
    password: savedConfig?.password || liveChatroomConfig.user.password,
    accessToken: savedConfig?.accessToken || liveChatroomConfig.user.accessToken,
  },
  chatrooms: {
    signaling: {
      roomId: savedConfig?.signalingRoomId || liveChatroomConfig.chatrooms.signaling.roomId,
    },
    interactive: {
      roomId: savedConfig?.interactiveRoomId || liveChatroomConfig.chatrooms.interactive.roomId,
    },
  },
  rtc: {
    channelName: savedConfig?.channelName || liveChatroomConfig.rtc.channelName,
  },
};

// ============================================
// 路由和组件引用
// ============================================
const router = useRouter();
const containerRef = ref<InstanceType<typeof LiveContainer> | null>(null);
const rtcRef = ref<LiveRtcExpose | null>(null);
const likeAnimationRef = ref<InstanceType<typeof LikeAnimation> | null>(null);

// ============================================
// 页面状态
// ============================================
const showStatus = ref(true);
const showLikeAnimation = ref(savedConfig?.showLikeAnimation !== false); // 默认开启点赞动画
const rtcRole = ref<'host' | 'audience'>(savedConfig?.role || 'host');
const isLargeMode = ref(savedConfig?.isLargeMode || false);
const userId = ref<string>(liveConfig.user.userId);
const roomId = ref<string>(liveConfig.chatrooms.interactive.roomId);
const signalingRoomId = ref<string>(liveConfig.chatrooms.signaling.roomId);
const channelName = ref<string>(liveConfig.rtc.channelName);
const accessToken = ref<string>(liveConfig.user.accessToken || '');

// ============================================
// RTC 事件处理
// ============================================
const handleRtcJoined = (channelId: string, uid: number) => {
  console.log('[LiveRoom] RTC加入成功:', channelId, uid);
  containerRef.value?.updateRtcStatus({
    joined: true,
    channelId,
    localUid: String(uid)
  });
};

const handleRtcLeft = () => {
  console.log('[LiveRoom] RTC离开频道');
  containerRef.value?.updateRtcStatus({
    joined: false,
    channelId: null,
    localUid: null
  });
};

const handleRtcError = (error: Error) => {
  console.error('[LiveRoom] RTC错误:', error);
  showToast({ message: `RTC错误: ${error.message}`, type: 'fail' });
};

const handleUserPublished = (user: any, mediaType: 'audio' | 'video') => {
  console.log('[LiveRoom] 用户发布流:', user.uid, mediaType);
};

const handleUserUnpublished = (user: any, mediaType: 'audio' | 'video') => {
  console.log('[LiveRoom] 用户取消发布流:', user.uid, mediaType);
};

// ============================================
// IM 连接和聊天室管理
// ============================================

/** 注册 IM 连接状态监听 */
const setupIMListeners = () => {
  // 连接状态监听 - IM连接成功后初始化RTC
  EMClient.addEventHandler('CONNECTED', {
    onConnected: async () => {
      console.log('[LiveRoom] IM 已连接');
      await rtcRef.value?.initRTC();
      await rtcRef.value?.joinChannel();
      containerRef.value?.updateImStatus({ connected: true, userId: userId.value });
    },
    onDisconnected: () => {
      console.log('[LiveRoom] IM 已断开');
      containerRef.value?.updateImStatus({ connected: false, userId: null });
    },
  });

  // 互动直播间消息监听（包含文本消息和 CMD 命令消息）
  EMClient.addEventHandler('RECEIVE_MESSAGE', {
    onTextMessage: (message: EasemobChat.TextMsgBody) => {
      if (message.to === roomId.value) {
        batchUpdate(message);
      }
    },
    onCmdMessage: (message: EasemobChat.CmdMsgBody) => {
      if (message.to === roomId.value) {
        handleInteractiveCmdMessage(message);
      }
    },
  });

  // 信令直播间监听（连麦邀请、开关播、踢人/禁言等控制信令）
  // 注意：点赞、弹幕等高频互动消息应走互动聊天室，不要占用信令通道
  EMClient.addEventHandler('RECEIVED_SIGNALING_MESSAGE', {
    onCustomMessage(msg: EasemobChat.CustomMsgBody) {
      console.log('[LiveRoom] 信令聊天室收到自定义消息:', msg);
    },
    onCmdMessage(msg: EasemobChat.CmdMsgBody) {
      console.log('[LiveRoom] 信令聊天室收到命令消息:', msg);
    },
  });
};

/** 加入互动直播间 */
const joinLiveChatroom = async () => {
  try {
    await EMClient.joinChatRoom({ roomId: roomId.value, message: '加入互动直播间' });
    showToast({ message: '加入直播间成功', duration: 1000 });
  } catch (error) {
    console.error('[LiveRoom] 加入互动直播间失败:', error);
  }
};

/** 加入信令直播间 */
const joinLiveSignalingChatroom = async () => {
  try {
    await EMClient.joinChatRoom({ roomId: signalingRoomId.value, message: '加入信令聊天室' });
    showToast({ message: '加入信令聊天室成功', duration: 1000 });
  } catch (error) {
    console.error('[LiveRoom] 加入信令聊天室失败:', error);
  }
};

/** 登录 IM */
const loginIM = async () => {
  const loginParams: { user: string; pwd?: string; accessToken?: string } = { user: userId.value };

  if (!userId.value) {
    showToast({ message: '用户ID不能为空', type: 'fail' });
    return;
  }

  if (!liveConfig.user.password && !liveConfig.user.accessToken) {
    showToast({ message: '密码或Token不能为空', type: 'fail' });
    return;
  }

  if (liveConfig.user.password) {
    loginParams.pwd = liveConfig.user.password;
  } else {
    loginParams.accessToken = liveConfig.user.accessToken;
  }

  try {
    await EMClient.open(loginParams);
    await joinLiveSignalingChatroom();
    await joinLiveChatroom();
    await fetchLiveChatroomHistoryMessages();
  } catch (error) {
    console.error('[LiveRoom] IM 登录失败:', error);
  }
};

// ============================================
// 消息管理
// ============================================
const messageList = ref<EasemobChat.ExcludeAckMessageBody[]>([]);
const MAX_MESSAGES_LIST = 30;

/** 高性能消息合并排序 */
const mergeAndSortMessages = (
  existingList: EasemobChat.ExcludeAckMessageBody[],
  newMessages: EasemobChat.ExcludeAckMessageBody[]
): EasemobChat.ExcludeAckMessageBody[] => {
  if (newMessages.length === 0) return existingList;

  const existingIds = new Set(existingList.map(msg => msg.id));
  const uniqueNewMessages = newMessages.filter(msg => !existingIds.has(msg.id));
  if (uniqueNewMessages.length === 0) return existingList;

  const merged = [...existingList, ...uniqueNewMessages];
  return merged
    .map(msg => ({ msg, time: msg.time || 0 }))
    .sort((a, b) => a.time - b.time)
    .map(({ msg }) => msg);
};

/** 获取历史消息 */
const fetchLiveChatroomHistoryMessages = async () => {
  try {
    const res = await EMClient.getHistoryMessages({
      targetId: roomId.value,
      chatType: 'chatRoom',
      cursor: null,
      pageSize: 10,
    });
    if (res?.messages?.length > 0) {
      messageList.value = mergeAndSortMessages(
        messageList.value,
        res.messages as EasemobChat.ExcludeAckMessageBody[]
      );
    }
  } catch (error) {
    console.error('[LiveRoom] 获取历史消息失败:', error);
  }
};

/** 添加消息到列表（限制最大数量） */
const batchUpdate = (message: EasemobChat.ExcludeAckMessageBody) => {
  if (messageList.value.length >= MAX_MESSAGES_LIST) {
    messageList.value.shift();
  }
  messageList.value.push(message);
};

// ============================================
// 消息发送
// ============================================
const messageContent = ref<string>('');

/** 普通模式发送消息（防抖 300ms） */
const sendMessage = useDebounceFn(async () => {
  if (!messageContent.value.trim()) return;

  const options: EasemobChat.CreateTextMsgParameters = {
    to: roomId.value,
    type: 'txt',
    msg: messageContent.value,
    chatType: 'chatRoom',
    ext: {
      nickname: `${liveConfig.user.nickname}(${liveConfig.user.userId})`,
      role: rtcRole.value,
      timestamp: Date.now(),
      channelName: channelName.value
    }
  };

  try {
    const msg = WebSDK.message.create(options);
    const { message } = await EMClient.send(msg);
    messageList.value.push(message as EasemobChat.ExcludeAckMessageBody);
    messageContent.value = '';
  } catch (error) {
    console.error('[LiveRoom] 发送消息失败:', error);
  }
}, 300);

// ============================================
// 大型直播间模式
// ============================================
let largeModeTimer: NodeJS.Timeout | null = null;
const MESSAGE_SEND_INTERVAL = 60000; // 1分钟

/** 大型直播间发送逻辑（带频率限制） */
const sendMessageInLargeMode = async () => {
  if (!messageContent.value.trim()) return;

  // 冷却期内：仅本地展示，不发送到服务器
  if (largeModeTimer) {
    const localMsg = WebSDK.message.create({
      to: roomId.value,
      type: 'txt',
      msg: messageContent.value + '（LocalSend）',
      chatType: 'chatRoom',
      from: EMClient.context.userId,
      ext: {
        nickname: liveConfig.user.userId + '（本地）',
        timestamp: Date.now(),
        channelName: channelName.value,
        isLocal: true
      }
    });
    messageList.value.push(localMsg as EasemobChat.ExcludeAckMessageBody);
    messageContent.value = '';
  } else {
    // 冷却期外：正常发送
    sendMessage();
    largeModeTimer = setTimeout(() => {
      largeModeTimer = null;
    }, MESSAGE_SEND_INTERVAL);
  }
};

// ============================================
// 页面导航
// ============================================
// ============================================
// 点赞动画与上报
// ============================================

/**
 * 处理互动聊天室收到的 CMD 命令消息
 * 
 * 【设计说明】点赞 CMD 走互动聊天室下发，不走信令聊天室。
 * 原因：
 *   1. 点赞是高频"可级"更新，允许轻微丢失，适合互动聊天室的广播模型；
 *   2. 互动聊天室可支持更频繁的服务端聚合广播（1~5条/秒）；
 *   3. 信令聊天室应留给连麦、开关播等必须可靠到达的控制信令。
 * 
 * 识别 action 为 'like' 的点赞消息，触发飘浮动画。
 */
const handleInteractiveCmdMessage = (msg: EasemobChat.CmdMsgBody) => {
  console.log('[LiveRoom] 互动直播间收到 CMD 消息:', msg);

  // 判断是否为点赞消息
  const action = msg.action || '';
  const isLikeAction = action === 'like' || action === 'Like' || action === 'LIKE';

  if (!isLikeAction) return;

  // 从 ext 中解析点赞数量，服务端聚合后下发
  const ext = (msg.ext || {}) as Record<string, any>;
  const likeNumberRaw = ext.like_number || ext.likeNumber || ext.like_count || '1';
  const likeNumber = parseInt(String(likeNumberRaw), 10) || 1;

  console.log(`[LiveRoom] 收到点赞 CMD，数量: ${likeNumber}`);

  // 触发点赞飘浮动画
  likeAnimationRef.value?.triggerLike(likeNumber);
};

/**
 * 用户本地点击点赞后的上报接口（预留）
 * 实际业务中可替换为真实的 HTTP 上报接口
 */
const handleLikeReport = async (count: number): Promise<void> => {
  console.log(`[LiveRoom] 点赞上报（聚合）: ${count} 次`);

  // TODO: 接入真实的业务上报接口
  // 示例：
  // await fetch('https://your-api-domain.com/api/live/like', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     roomId: roomId.value,
  //     userId: userId.value,
  //     count,
  //     timestamp: Date.now(),
  //   }),
  // });

  // 当前为演示，模拟上报成功
  return new Promise((resolve) => setTimeout(resolve, 50));
};

/** 本地点赞点击回调 */
const handleLocalLikeClick = (count: number) => {
  console.log('[LiveRoom] 用户点击点赞，当前聚合计数:', count);
};

/** 点赞上报成功回调 */
const handleReportSuccess = (count: number) => {
  console.log('[LiveRoom] 点赞上报成功，数量:', count);
};

/** 点赞上报失败回调 */
const handleReportFail = (error: unknown, count: number) => {
  console.error('[LiveRoom] 点赞上报失败，数量:', count, '错误:', error);
};

const goToConfig = () => router.push('/im/livechatroom');

const goToHome = async () => {
  console.log('[LiveRoom] 返回首页，开始清理资源');

  // 销毁 RTC 实例
  if (rtcRef.value) {
    try {
      await rtcRef.value.destroy();
      console.log('[LiveRoom] RTC 实例已销毁');
    } catch (error) {
      console.error('[LiveRoom] 销毁 RTC 实例失败:', error);
    }
  }

  // 清理 IM 连接
  try {
    EMClient.close();
    EMClient.removeEventHandler('CONNECTED');
    EMClient.removeEventHandler('RECEIVE_MESSAGE');
    EMClient.removeEventHandler('RECEIVED_SIGNALING_MESSAGE');
    console.log('[LiveRoom] IM 连接已关闭');
  } catch (error) {
    console.error('[LiveRoom] 关闭 IM 连接失败:', error);
  }

  router.push('/home');
};

// ============================================
// 生命周期
// ============================================
onMounted(() => {
  setupIMListeners();
  loginIM();
});

onUnmounted(() => {
  // 页面卸载时清理（当用户刷新或关闭页面时触发）
  EMClient.close();
  EMClient.removeEventHandler('CONNECTED');
  EMClient.removeEventHandler('RECEIVE_MESSAGE');
  EMClient.removeEventHandler('RECEIVED_SIGNALING_MESSAGE');
  
  // 清理大型模式定时器
  if (largeModeTimer) {
    clearTimeout(largeModeTimer);
    largeModeTimer = null;
  }
});
</script>

<style scoped>
/* 返回首页按钮 */
.home-btn {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  color: white;
  cursor: pointer;
  z-index: 111;
  transition: background-color 0.2s;
  pointer-events: auto;
}

.home-btn:active {
  background-color: rgba(0, 0, 0, 0.7);
}

/* 角色标识 */
.role-badge {
  position: absolute;
  top: 10px;
  left: 55px;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  color: white;
  z-index: 111;
}

.role-badge.host {
  background-color: #ff4444;
}

.role-badge.audience {
  background-color: #4488ff;
}

/* 配置按钮 */
.config-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  color: white;
  cursor: pointer;
  z-index: 111;
  transition: background-color 0.2s;
  pointer-events: auto;
}

.config-btn:active {
  background-color: rgba(0, 0, 0, 0.7);
}

/* 大型模式标识 */
.mode-badge {
  position: absolute;
  top: 10px;
  right: 55px;
  padding: 6px 12px;
  background-color: #07c160;
  color: white;
  font-size: 12px;
  border-radius: 12px;
  z-index: 111;
}

/* 发送弹幕容器 */
.send-danmaku-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: rgba(34, 34, 34, 0.9);
  border-top: 1px solid #333;
  backdrop-filter: blur(10px);
}

.send-danmaku-container input {
  flex: 1;
  padding: 8px;
  margin-right: 10px;
  border: none;
  border-radius: 4px;
  background-color: #333;
  color: white;
  outline: none;
}

.send-danmaku-container input::placeholder {
  color: #888;
}

.send-danmaku-container button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background-color: #007bff;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
  white-space: nowrap;
}

.send-danmaku-container button:hover {
  background-color: #0056b3;
}

/* 响应式 */
@media (max-width: 768px) {
  .send-danmaku-container {
    padding: 8px;
  }

  .send-danmaku-container input {
    padding: 6px;
    font-size: 14px;
  }

  .send-danmaku-container button {
    padding: 6px 12px;
    font-size: 14px;
  }
}
</style>
