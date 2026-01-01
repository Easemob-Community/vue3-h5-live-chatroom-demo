<template>
  <div>
    <!-- 模式切换开关 -->
    <div class="mode-switch-container">
      <span>大型直播间弹幕策略切换</span>
      <van-switch
        v-model="isLargeMode"
        class="mode-switch"
        size="24px"
        active-color="#07c160"
        inactive-color="#dcdee0"
        active-text="大型模式"
        inactive-text="普通模式"
      />
    </div>

    <!-- 拉流容器 -->
    <div class="live-stream-container">
      <!-- 这里可以放置拉流的视频组件，例如 video 标签 -->
      <!-- <video ref="videoRef" autoplay muted controls width="100%" height="auto"></video> -->
    </div>
    <!-- 互动弹幕区域 -->
    <DanmakuComp :messageList="messageList" />
    <!-- 发送弹幕区域 -->
    <div class="send-danmaku-container">
      <input v-model.trim="messageContent" type="text" placeholder="输入弹幕内容" />
      <button v-if="isLargeMode" @click="sendMessageInLargeMode">发送大型直播间</button>
      <button v-else @click="sendMessage">发送</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect, watch, onMounted, onUnmounted } from 'vue';
import { useThrottleFn, useDebounceFn } from '@vueuse/core';
import { showToast } from 'vant';
import { useRoute } from 'vue-router';
import DanmakuComp from './components/DanmakuList/index.vue';
// IM
import { WebSDK, EMClient, EasemobChat } from '@/easeim';
const route = useRoute();
const userId = ref<string>('');
const roomId = ref<string>('');
const accessToken = ref<string>('');
watchEffect(() => {
  console.log(route);
  if (route.query.userId && route.query.roomId && route.query.token) {
    userId.value = route.query.userId as string;
    roomId.value = route.query.roomId as string;
    accessToken.value = route.query.token as string;
  }
});
// 挂载连接监听
const mountEMConnectedListener = () => {
  EMClient.addEventHandler('CONNECTED', {
    onConnected: async () => {
      console.log('im connected');
    },
    onDisconnected: () => {
      console.log('im disconnected');
    },
  });
};
// 挂载消息监听
const mountEMMessageListener = () => {
  EMClient.addEventHandler('RECEIVED_NEW_MESSAGE', {
    onTextMessage: (message: EasemobChat.TextMsgBody) => {
      batchUpdate(message);
    },
  });
};
// 挂载信令直播间信令监听
const mountEMSignalingChatroomListener = () => {
  EMClient.addEventHandler('RECEIVED_NEW_MESSAGE', {
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
      roomId: 'signaling_room_id',
      message: '加入信令聊天室',
    });
  } catch (error) {
    console.error('joinSignalingRoom error', error);
  }
};
// 环信登录
const loginIM = async () => {
  try {
    await EMClient.open({
      user: userId.value,
      accessToken: accessToken.value,
    });
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
      // 展开反转后的消息数组，而不是将数组作为单个元素添加
      messageList.value = [...(res.messages.reverse() as EasemobChat.ExcludeAckMessageBody[]), ...messageList.value];
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
      nickname:'xxxxx'
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
 * @description 节流更新消息列表，避免频繁更新 DOM，导致性能问题,500毫秒内只更新一次新收到的消息
 */
const batchUpdate = useThrottleFn((message) => {
  // 如果消息列表长度超过30条，删除最早的一条消息
  if (messageList.value.length > MAX_MESSAGES_LIST) {
    messageList.value.shift();
  }
  messageList.value.push(message);
}, 500); // 防抖时间为300毫秒，可根据实际情况调整

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
  EMClient.removeEventHandler('RECEIVED_NEW_MESSAGE');
});

// 新增大型模式状态
const isLargeMode = ref(false);

// 监听模式变化
watch(isLargeMode, (newVal) => {
  // 这里可以添加模式切换后的逻辑
  console.log(`当前模式: ${newVal ? '大型直播间' : '普通'}`);
});
</script>

<style scoped>
.live-stream-container {
  height: 100vh; /* 上半部分占70%的视口高度 */
  background-image: url('@/assets/images/live-stream.jpg'); /* 替换为实际的直播流背景图 */
  background-size: cover;
  background-position: center;
  display: flex;
  justify-content: center;
  align-items: center;
}

.send-danmaku-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: #222;
  border-top: 1px solid #333;
  position: fixed; /* 固定在页面底部 */
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100; /* 确保在其他元素之上 */
}

.send-danmaku-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: #222;
  border-top: 1px solid #333;
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
}

.send-danmaku-container button:hover {
  background-color: #0056b3;
}

/* 新增模式切换样式 */
.mode-switch-container {
  position: absolute;
  top: 10px;
  right: 10px;
  color: white;
  display: flex;
  align-items: center;
}
</style>
