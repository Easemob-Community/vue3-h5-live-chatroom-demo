<template>
  <div>
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
      <button @click="sendMessage">发送</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect, onMounted, onUnmounted } from 'vue';
import { useThrottleFn, useDebounceFn } from '@vueuse/core';

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
      console.log('onTextMessage', message);
      batchUpdate(message);
    },
  });
};
mountEMMessageListener();
mountEMConnectedListener();
const joinChatroom = async () => {
  try {
    EMClient.joinChatRoom({
      roomId: roomId.value,
      message: '加入聊天室',
    });
  } catch (error) {
    console.error('joinChatroom error', error);
  }
};
const loginIM = async () => {
  try {
    await EMClient.open({
      user: userId.value,
      accessToken: accessToken.value,
    });
    await joinChatroom();
    await fetchChatroomMessages();
  } catch (error) {
    console.error('loginIM error', error);
  }
};

// 可展示消息类型声明

const messageList = ref<EasemobChat.ExcludeAckMessageBody[]>([]);
// 获取聊天室消息
const fetchChatroomMessages = async () => {
  try {
    const res = await EMClient.getHistoryMessages({
      targetId: roomId.value,
      chatType: 'chatRoom',
      cursor: null,
      pageSize: 10,
    });
    console.log('fetchChatroomMessages', res);
    if (res?.messages?.length > 0) {
      console.log('res.messages.reverse() as EasemobChat.MessageBody', res.messages.reverse());
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

onMounted(() => {
  loginIM();
});

onUnmounted(() => {
  EMClient.close();
  EMClient.removeEventHandler('CONNECTED');
  EMClient.removeEventHandler('RECEIVED_NEW_MESSAGE');
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
</style>
