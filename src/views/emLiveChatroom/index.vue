<template>
  <LiveContainer ref="containerRef" :show-status="showStatus">
    <!-- RTC层插槽 -->
    <template #rtc>
      <LiveRTC ref="rtcRef" :channel-name="channelName" :user-id="userId" :role="rtcRole" auto-join
        @joined="handleRtcJoined" @left="handleRtcLeft" @error="handleRtcError" @user-published="handleUserPublished"
        @user-unpublished="handleUserUnpublished" />
    </template>

    <!-- 弹幕层插槽 -->
    <template #danmaku>
      <DanmakuComp :message-list="messageList" />
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
        <button v-if="isLargeMode" @click="sendMessageInLargeMode">发送大型直播间</button>
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
import type { LiveRtcExpose } from './components/LiveRTC/types';
// IM
import { WebSDK, EMClient, EasemobChat } from '@/easeim';

// 直播间配置
import { liveChatroomConfig } from '@/constants';

const router = useRouter();

// 本地存储key
const STORAGE_KEY = 'live_chatroom_config';

// 加载配置（优先从localStorage读取）
const loadConfig = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('读取本地配置失败', error);
  }
  return null;
};

// 合并配置
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

// 组件引用
const containerRef = ref<InstanceType<typeof LiveContainer> | null>(null)
const rtcRef = ref<LiveRtcExpose | null>(null)

// 配置和状态
const showStatus = ref(true)
const rtcRole = ref<'host' | 'audience'>(savedConfig?.role || 'host')

// 从配置中提取必要的参数
const userId = ref<string>(liveConfig.user.userId);
const roomId = ref<string>(liveConfig.chatrooms.interactive.roomId);
const signalingRoomId = ref<string>(liveConfig.chatrooms.signaling.roomId);
const channelName = ref<string>(liveConfig.rtc.channelName);
const accessToken = ref<string>(liveConfig.user.accessToken || '');
// RTC事件处理方法
const handleRtcJoined = (channelId: string, uid: number) => {
  console.log('RTC加入成功:', channelId, uid)
  // 更新容器状态
  containerRef.value?.updateRtcStatus({
    joined: true,
    channelId,
    localUid: String(uid)
  })
}

const handleRtcLeft = () => {
  console.log('RTC离开频道')
  containerRef.value?.updateRtcStatus({
    joined: false,
    channelId: null,
    localUid: null
  })
}

const handleRtcError = (error: Error) => {
  console.error('RTC错误:', error)
  showToast({
    message: `RTC错误: ${error.message}`,
    type: 'fail'
  })
}

const handleUserPublished = (user: any, mediaType: 'audio' | 'video') => {
  console.log('用户发布流:', user.uid, mediaType)
}

const handleUserUnpublished = (user: any, mediaType: 'audio' | 'video') => {
  console.log('用户取消发布流:', user.uid, mediaType)
}
const mountEMConnectedListener = () => {
  EMClient.addEventHandler('CONNECTED', {
    onConnected: async () => {
      console.log('im connected');
      // IM连接成功后，初始化RTC（需要IM连接后才能安全获取Token）
      await rtcRef.value?.initRTC()

      // 初始化成功后，加入RTC频道
      await rtcRef.value?.joinChannel()

      // 更新容器状态
      containerRef.value?.updateImStatus({
        connected: true,
        userId: userId.value
      })
    },
    onDisconnected: () => {
      console.log('im disconnected');
      // 更新容器状态
      containerRef.value?.updateImStatus({
        connected: false,
        userId: null
      })
    },
  });
};
// 挂载互动直播间消息监听
const mountEMMessageListener = () => {
  EMClient.addEventHandler('RECEIVE_MESSAGE', {
    onTextMessage: (message: EasemobChat.TextMsgBody) => {
      // 只处理互动直播间的消息，过滤其他聊天室的消息
      if (message.to === roomId.value) {
        batchUpdate(message);
      }
    },
  });
};
// 挂载信令直播间信令监听
const mountEMSignalingChatroomListener = () => {
  EMClient.addEventHandler('RECEIVED_SIGNALING_MESSAGE', {
    onCustomMessage(msg: EasemobChat.CustomMsgBody) {
      console.log('onCustomMessage', msg);
    },
    onCmdMessage(msg: EasemobChat.CmdMsgBody) {
      console.log('onCmdMessage', msg);
    },
  });
};
mountEMConnectedListener();
mountEMMessageListener();
mountEMSignalingChatroomListener();
// 加入互动直播间
const joinLiveChatroom = async () => {
  try {
    await EMClient.joinChatRoom({
      roomId: roomId.value,
      message: '互动直播间成功',
    });
    showToast({
      message: '加入直播间成功',
      duration: 1000,
    });
  } catch (error) {
    console.error('joinChatroom error', error);
  }
};
// 加入信令直播间
const joinLiveSignalingChatroom = async () => {
  try {
    await EMClient.joinChatRoom({
      roomId: signalingRoomId.value,
      message: '加入信令聊天室',
    });
    showToast({
      message: '加入信令聊天室成功',
      duration: 1000,
    });
  } catch (error) {
    console.error('joinSignalingRoom error', error);
  }
};
// 环信登录
const loginIM = async () => {
  const loginParams: {
    user: string;
    pwd?: string;
    accessToken?: string;
  } = {
    user: userId.value,
  }
  if (!userId.value) {
    showToast({
      message: '用户ID不能为空',
      type: 'fail'
    });
    return;
  }
  // pwd 或者 token具备任意一个值即可
  if (!liveConfig.user.password && !liveConfig.user.accessToken) {
    showToast({
      message: '密码或Token不能为空',
      type: 'fail'
    });
    return;
  }
  if (liveConfig.user.password) {
    loginParams.pwd = liveConfig.user.password;
  } else {
    loginParams.accessToken = liveConfig.user.accessToken;
  }
  try {
    await EMClient.open(loginParams);
    /* 与环信建连成功后所需初始操作 */
    // 加入信令直播间
    await joinLiveSignalingChatroom();
    // 加入互动直播间
    await joinLiveChatroom();
    // 获取互动直播间初始弹幕消息
    await fetchLiveChatroomHistoryMessages();
  } catch (error) {
    console.error('loginIM error', error);
  }
};

// 可展示消息类型声明
const messageList = ref<EasemobChat.ExcludeAckMessageBody[]>([]);

/**
 * @description 合并并排序消息列表（高性能版本）
 * @param existingList 现有消息列表
 * @param newMessages 新获取的消息数组
 * @returns 按时间戳排序（早→晚）的去重消息列表
 */
const mergeAndSortMessages = (
  existingList: EasemobChat.ExcludeAckMessageBody[],
  newMessages: EasemobChat.ExcludeAckMessageBody[]
): EasemobChat.ExcludeAckMessageBody[] => {
  if (newMessages.length === 0) return existingList;

  // 使用 Set 进行 O(1) 复杂度的去重检查
  const existingIds = new Set(existingList.map(msg => msg.id));

  // 过滤出唯一的新消息
  const uniqueNewMessages = newMessages.filter(msg => !existingIds.has(msg.id));

  if (uniqueNewMessages.length === 0) return existingList;

  // 合并消息
  const merged = [...existingList, ...uniqueNewMessages];

  // 按时间戳排序（早→晚），使用 Schwartzian transform 优化性能
  return merged
    .map(msg => ({ msg, time: msg.time || 0 }))
    .sort((a, b) => a.time - b.time)
    .map(({ msg }) => msg);
};

// 获取聊天室消息
const fetchLiveChatroomHistoryMessages = async () => {
  try {
    const res = await EMClient.getHistoryMessages({
      targetId: roomId.value,
      chatType: 'chatRoom',
      cursor: null,
      pageSize: 10,
    });
    console.log('fetchChatroomMessages', res);
    if (res?.messages?.length > 0) {
      // 使用高性能合并排序方法
      messageList.value = mergeAndSortMessages(
        messageList.value,
        res.messages as EasemobChat.ExcludeAckMessageBody[]
      );
    }
  } catch (error) {
    console.error('fetchChatroomMessages error', error);
  }
};
// 发送消息
const messageContent = ref<string>('');
const MAX_MESSAGES_LIST = 30;
const sendMessage = useDebounceFn(async () => {
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
    console.log('message', message);
    messageList.value.push(message as EasemobChat.ExcludeAckMessageBody); // 将消息添加到 messag
  } catch (error) {
    console.error('sendMessage error', error);
  } finally {
    messageContent.value = '';
  }
}, 300);

/**
 * @param message
 * @description 更新消息列表
 */
const batchUpdate = (message: EasemobChat.ExcludeAckMessageBody) => {
  // 如果消息列表长度超过30条，删除最早的一条消息
  if (messageList.value.length > MAX_MESSAGES_LIST) {
    messageList.value.shift();
  }
  messageList.value.push(message);
};

/**
 * 大型直播间模式下的消息处理。
 * 大型直播间模式下，消息处理逻辑与普通模式不同。
 * 其会在1分钟才可进行一次有效的消息发送。
 * 一次有效调用后，剩下的发送调用仅本地展示，不进行实际的消息发送。
 */
// 定义一个定时器，用于控制消息发送的频率
let timer: NodeJS.Timeout | null = null;
// 定义一个常量，表示消息发送的间隔时间，单位为毫秒
const MESSAGE_SEND_INTERVAL = 60000; // 1分钟
// 大型直播间的发送方法调用函数
const sendMessageInLargeMode = async () => {
  // 如果定时器不为空，说明上一次发送还未完成，将消息内容push到消息列表中
  if (timer) {
    const createTextMsg: EasemobChat.CreateTextMsgParameters = {
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
    };
    const msg = WebSDK.message.create(createTextMsg);
    console.log(msg);
    messageList.value.push(msg as EasemobChat.ExcludeAckMessageBody);
    messageContent.value = '';
  }
  // 如果定时器为空，则本地调用则直接调用sendMessage进行消息发送，并再次开启定时器进行限制。
  // 注意：此处的sendMessage是复用普通模式下的发送方法调用函数。
  else if (!timer) {
    sendMessage();
    timer = setTimeout(() => {
      timer = null;
    }, MESSAGE_SEND_INTERVAL);
  }
};
onMounted(() => {
  loginIM();
});

onUnmounted(() => {
  EMClient.close();
  EMClient.removeEventHandler('CONNECTED');
  EMClient.removeEventHandler('RECEIVE_MESSAGE');
  EMClient.removeEventHandler('RECEIVED_SIGNALING_MESSAGE');
});

// 新增大型模式状态（从配置读取）
const isLargeMode = ref(savedConfig?.isLargeMode || false);

// 监听模式变化
watch(isLargeMode, (newVal) => {
  // 这里可以添加模式切换后的逻辑
  console.log(`当前模式: ${newVal ? '大型直播间' : '普通'}`);
});

// 跳转到配置页面
const goToConfig = () => {
  router.push('/im/livechatroom');
};

// 返回首页
const goToHome = async () => {
  console.log('[emLiveChatroom] 点击返回首页，开始清理资源')

  // 主动销毁 RTC 实例（彻底清理）
  if (rtcRef.value) {
    try {
      await rtcRef.value.destroy()  // 使用 destroy 而不是 leaveChannel
      console.log('[emLiveChatroom] ✅ RTC 实例已销毁')
    } catch (error) {
      console.error('[emLiveChatroom] 销毁 RTC 实例时出错:', error)
    }
  }

  // 清理 IM 连接
  try {
    EMClient.close()
    EMClient.removeEventHandler('CONNECTED')
    EMClient.removeEventHandler('RECEIVE_MESSAGE')
    EMClient.removeEventHandler('RECEIVED_SIGNALING_MESSAGE')
    console.log('[emLiveChatroom] ✅ IM 连接已关闭')
  } catch (error) {
    console.error('[emLiveChatroom] 关闭 IM 连接时出错:', error)
  }

  // 跳转到首页
  router.push('/home')
};
</script>

<style scoped>
/* 模式切换开关样式 */
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

.mode-switch-container {
  position: absolute;
  top: 10px;
  right: 10px;
  margin: 0;
  color: white;
  display: flex;
  align-items: center;
  z-index: 110;
  /* 确保在最顶层 */
  background-color: rgba(0, 0, 0, 0.5);
  padding: 8px 12px;
  border-radius: 20px;
}

/* 发送弹幕容器样式 */
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

/* 响应式设计 */
@media (max-width: 768px) {
  .mode-switch-container {
    top: 5px;
    right: 5px;
    padding: 6px 10px;
    font-size: 14px;
  }

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
