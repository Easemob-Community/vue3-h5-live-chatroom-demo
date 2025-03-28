<template>
  <div>
    <!-- 拉流容器 -->
    <div class="live-stream-container">
      <!-- 这里可以放置拉流的视频组件，例如 video 标签 -->
      <!-- <video ref="videoRef" autoplay muted controls width="100%" height="auto"></video> -->
    </div>
    <!-- 互动弹幕区域 -->
    <DanmakuComp />
    <!-- 发送弹幕区域 -->
    <div class="send-danmaku-container">
      <input type="text" placeholder="输入弹幕内容" />
      <button>发送</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import DanmakuComp from './components/DanmakuList/index.vue';
// IM
import { EMClient } from '@/easeim';
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
//挂载连接监听
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
//挂载消息监听
const mountEMMessageListener = () => {
  EMClient.addEventHandler('RECEIVED_NEW_MESSAGE', {});
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
  } catch (error) {
    console.error('loginIM error', error);
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
