# 环信 IM 直播间弹幕集成文档

本文档详细介绍如何在 Vue 3 项目中集成环信（Easemob）IM SDK，实现直播间弹幕功能。包括普通模式和大型直播间模式两种场景的消息处理策略，以及双聊天室架构设计。

## 目录

- [架构概述](#架构概述)
- [技术栈](#技术栈)
- [核心模块说明](#核心模块说明)
  - [1. 环信 SDK 初始化](#1-环信-sdk-初始化)
  - [2. 直播间主页面](#2-直播间主页面)
  - [3. 弹幕列表组件](#3-弹幕列表组件)
  - [4. 配置页面](#4-配置页面)
- [双聊天室架构](#双聊天室架构)
- [消息处理策略](#消息处理策略)
- [API 参考](#api-参考)
- [配置说明](#配置说明)
- [常见问题](#常见问题)

---

## 架构概述

```
┌─────────────────────────────────────────────────────────────────┐
│                      直播间架构                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐        ┌─────────────────────┐            │
│  │   互动聊天室     │        │     信令聊天室       │            │
│  │  (Interactive)  │        │    (Signaling)      │            │
│  ├─────────────────┤        ├─────────────────────┤            │
│  │ • 用户弹幕消息   │        │ • 商品上架通知       │            │
│  │ • 用户互动消息   │        │ • 价格变动通知       │            │
│  │ • 普通文本消息   │        │ • 抽奖开始/结束      │            │
│  │ • 高频率、量大   │        │ • 禁言/解禁指令      │            │
│  │ • 可丢包、可延迟 │        │ • 高优先级、必达     │            │
│  └────────┬────────┘        └──────────┬──────────┘            │
│           │                            │                       │
│           ▼                            ▼                       │
│  ┌─────────────────────────────────────────────┐              │
│  │              EMClient (环信 SDK)              │              │
│  └─────────────────────────────────────────────┘              │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────────────────────────────────┐              │
│  │              直播间主页面                      │              │
│  │  ┌──────────────┐  ┌─────────────────────┐  │              │
│  │  │  RTC 视频层   │  │    弹幕显示层        │  │              │
│  │  │  (LiveRTC)   │  │   (DanmakuList)     │  │              │
│  │  └──────────────┘  └─────────────────────┘  │              │
│  └─────────────────────────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Vue | 3.x | 前端框架 |
| TypeScript | 4.x+ | 类型支持 |
| Easemob WebSDK | latest | 环信即时通讯 SDK |
| Agora RTC SDK | ^4.24.2 | 声网音视频 SDK |
| Vant | - | UI 组件库 |
| VueUse | ^7.7.1 | 工具库 (useDebounceFn) |
| vue-virtual-scroller | - | 虚拟列表组件 |

---

## 核心模块说明

### 1. 环信 SDK 初始化

**文件路径**: `src/easeim/index.ts`

```typescript
import WebSDK, { EasemobChat, EasemobChatStatic } from 'easemob-websdk';

// 根据环境设置日志级别
if (process.env.NODE_ENV === 'production') {
  WebSDK.logger.setLevel('WARN');
}
if (process.env.NODE_ENV === 'development') {
  WebSDK.logger.setLevel('DEBUG');
}

// 初始化 IM 连接实例
const EMClient = new WebSDK.connection({
  appKey: 'easemob-demo#support',  // 环信控制台获取的 App Key
});

export { WebSDK, EMClient, EasemobChat, EasemobChatStatic };
```

**要点说明**:
- `appKey`: 在环信控制台创建应用后获取
- 日志级别根据环境自动切换，便于调试和线上问题排查
- `WebSDK` 用于创建消息实例
- `EMClient` 用于连接管理和消息收发

---

### 2. 直播间主页面

**文件路径**: `src/views/emLiveChatroom/index.vue`

#### 页面结构

```vue
<template>
  <LiveContainer ref="containerRef" :show-status="showStatus">
    <!-- RTC层插槽 -->
    <template #rtc>
      <LiveRTC ref="rtcRef" :channel-name="channelName" :user-id="userId" 
               :role="rtcRole" auto-join @joined="handleRtcJoined" 
               @user-published="handleUserPublished" />
    </template>

    <!-- 弹幕层插槽 -->
    <template #danmaku>
      <DanmakuComp :message-list="messageList" />
    </template>

    <!-- 顶部控制层 -->
    <template #control-top>
      <div class="role-badge" :class="rtcRole === 'host' ? 'host' : 'audience'">
        {{ rtcRole === 'host' ? '主播' : '观众' }}
      </div>
      <div class="config-btn" @click="goToConfig">
        <van-icon name="setting-o" size="20" />
      </div>
    </template>

    <!-- 底部控制层 -->
    <template #control>
      <div class="send-danmaku-container">
        <input v-model.trim="messageContent" type="text" placeholder="输入弹幕内容" />
        <button v-if="isLargeMode" @click="sendMessageInLargeMode">发送</button>
        <button v-else @click="sendMessage">发送</button>
      </div>
    </template>
  </LiveContainer>
</template>
```

#### 配置加载

```typescript
// 本地存储 key
const STORAGE_KEY = 'live_chatroom_config';

// 加载配置（优先从 localStorage 读取）
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
```

#### 事件监听配置

```typescript
// 连接状态监听
const mountEMConnectedListener = () => {
  EMClient.addEventHandler('CONNECTED', {
    onConnected: async () => {
      console.log('im connected');
      // IM 连接成功后初始化 RTC
      await rtcRef.value?.initRTC();
      await rtcRef.value?.joinChannel();
    },
    onDisconnected: () => {
      console.log('im disconnected');
    },
  });
};

// 互动直播间消息监听
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

// 信令直播间监听
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
```

**注意**: 事件名称必须与环信 SDK 定义的一致：`RECEIVE_MESSAGE`（不是 `RECEIVED_NEW_MESSAGE`）

#### 登录与加入直播间

```typescript
// 环信登录
const loginIM = async () => {
  const loginParams: {
    user: string;
    pwd?: string;
    accessToken?: string;
  } = {
    user: userId.value,
  };
  
  // 支持密码或 Token 认证
  if (liveConfig.user.password) {
    loginParams.pwd = liveConfig.user.password;
  } else {
    loginParams.accessToken = liveConfig.user.accessToken;
  }
  
  try {
    await EMClient.open(loginParams);
    
    // 登录成功后加入直播间
    await joinLiveSignalingChatroom();        // 加入信令直播间
    await joinLiveChatroom();                 // 加入互动直播间
    await fetchLiveChatroomHistoryMessages(); // 获取历史消息
  } catch (error) {
    console.error('loginIM error', error);
  }
};

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
```

#### 获取历史消息

```typescript
const messageList = ref<EasemobChat.ExcludeAckMessageBody[]>([]);

/**
 * 高性能消息合并排序
 * 使用 Set 进行 O(1) 复杂度的去重检查
 */
const mergeAndSortMessages = (
  existingList: EasemobChat.ExcludeAckMessageBody[],
  newMessages: EasemobChat.ExcludeAckMessageBody[]
): EasemobChat.ExcludeAckMessageBody[] => {
  if (newMessages.length === 0) return existingList;

  // 使用 Set 去重
  const existingIds = new Set(existingList.map(msg => msg.id));
  const uniqueNewMessages = newMessages.filter(msg => !existingIds.has(msg.id));

  if (uniqueNewMessages.length === 0) return existingList;

  // 合并并排序（按时间戳从早到晚）
  const merged = [...existingList, ...uniqueNewMessages];
  return merged
    .map(msg => ({ msg, time: msg.time || 0 }))
    .sort((a, b) => a.time - b.time)
    .map(({ msg }) => msg);
};

// 获取聊天室历史消息
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
    console.error('fetchChatroomMessages error', error);
  }
};
```

#### 消息更新处理

```typescript
const MAX_MESSAGES_LIST = 30;

/**
 * 批量更新消息列表
 * 限制最大消息数量，超出则删除最早的消息
 */
const batchUpdate = (message: EasemobChat.ExcludeAckMessageBody) => {
  if (messageList.value.length > MAX_MESSAGES_LIST) {
    messageList.value.shift();
  }
  messageList.value.push(message);
};
```

#### 生命周期管理

```typescript
onMounted(() => {
  loginIM();
});

onUnmounted(() => {
  // 关闭 IM 连接
  EMClient.close();
  // 移除事件监听
  EMClient.removeEventHandler('CONNECTED');
  EMClient.removeEventHandler('RECEIVE_MESSAGE');
  EMClient.removeEventHandler('RECEIVED_SIGNALING_MESSAGE');
});
```

---

### 3. 弹幕列表组件

**文件路径**: `src/views/emLiveChatroom/components/DanmakuList/index.vue`

使用 `vue-virtual-scroller` 实现高性能虚拟列表，支持大量消息流畅滚动。

```vue
<template>
  <DynamicScroller 
    ref="scroller" 
    :items="messageList" 
    :min-item-size="54" 
    class="danmaku-container"
  >
    <template v-slot="{ item, active }">
      <DynamicScrollerItem 
        :item="item" 
        :active="active" 
        :size-dependencies="[item.msg]" 
        :data-index="item.id"
      >
        <div class="danmaku-item">
          <!-- 角色标签 -->
          <span v-if="item?.ext?.role"
            :class="['danmaku-role', item.ext.role === 'host' ? 'danmaku-role-host' : 'danmaku-role-audience']">
            {{ item.ext.role === 'host' ? '房主' : '观众' }}
          </span>
          
          <!-- 昵称 -->
          <span class="danmaku-nickname">{{ item?.ext?.nickname || item.from }}</span>
          <span class="danmaku-separator">:</span>
          
          <!-- 消息内容 -->
          <span class="danmaku-content">{{ item.msg }}</span>
        </div>
      </DynamicScrollerItem>
    </template>
  </DynamicScroller>
</template>
```

```typescript
<script setup lang="ts">
import { toRefs, watch, nextTick } from 'vue';

const props = defineProps({
  messageList: {
    type: Array,
    default: () => [],
  },
});

const { messageList } = toRefs(props);

// 监听消息变化，自动滚动到底部
watch(
  () => messageList.value,
  () => {
    scrollToBottom();
  },
  { deep: true },
);

const scrollToBottom = () => {
  nextTick(() => {
    const container = document.querySelector('.danmaku-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
};
</script>
```

---

### 4. 配置页面

**文件路径**: `src/views/emLiveChatroom/config.vue`

配置页面允许用户设置直播间参数，支持保存到 localStorage。

```vue
<template>
  <div class="live-config-page">
    <van-nav-bar title="直播间配置" left-arrow @click-left="onClickLeft" />

    <div class="config-form">
      <!-- 用户配置 -->
      <van-cell-group title="用户配置">
        <van-field v-model="form.userId" label="用户ID" placeholder="请输入用户ID" clearable />
        <van-field v-model="form.nickname" label="昵称" placeholder="请输入昵称" clearable />
        <van-field v-model="form.password" label="密码" placeholder="密码或Token任选其一" clearable />
        <van-field v-model="form.accessToken" label="AccessToken" type="textarea" rows="2" clearable />
      </van-cell-group>

      <!-- 角色选择 -->
      <van-cell-group title="角色选择">
        <van-cell title="加入身份">
          <template #right-icon>
            <van-radio-group v-model="form.role" direction="horizontal">
              <van-radio name="host">主播</van-radio>
              <van-radio name="audience">观众</van-radio>
            </van-radio-group>
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 直播间模式 -->
      <van-cell-group title="直播间模式">
        <van-cell title="大型直播间模式">
          <template #right-icon>
            <van-switch v-model="form.isLargeMode" size="24px" />
          </template>
        </van-cell>
      </van-cell-group>

      <!-- RTC配置 -->
      <van-cell-group title="RTC配置">
        <van-field v-model="form.channelName" label="频道名称" placeholder="请输入RTC频道名称" clearable />
      </van-cell-group>

      <!-- 聊天室配置 -->
      <van-cell-group title="聊天室配置">
        <van-field v-model="form.signalingRoomId" label="信令聊天室ID" clearable />
        <van-field v-model="form.interactiveRoomId" label="互动聊天室ID" clearable />
      </van-cell-group>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <van-button type="primary" block round @click="saveConfig">保存配置</van-button>
        <van-button type="success" block round @click="enterLiveRoom">进入直播间</van-button>
        <van-button type="default" block round @click="resetConfig">重置为默认</van-button>
      </div>
    </div>
  </div>
</template>
```

---

## 双聊天室架构

### 为什么需要双直播间

在大型直播场景中，单一直播间架构面临以下挑战：

| 问题 | 说明 |
|------|------|
| **消息量巨大** | 弹幕互动聊天室用户活跃，消息频率极高，可能导致消息堆积和延迟 |
| **信令可靠性** | 电商直播中的商品上架、价格变动、抽奖开始等重要通知需要确保送达 |
| **优先级冲突** | 弹幕消息可能淹没重要信令，导致关键信息被遗漏 |
| **性能瓶颈** | 大量弹幕消息处理会占用客户端和网络资源，影响信令接收 |

### 双直播间架构方案

采用**互动直播间 + 信令直播间**的双通道设计：

```
┌─────────────────────────────────────────────────────────┐
│                      用户客户端                          │
│  ┌─────────────────┐        ┌─────────────────────┐    │
│  │   互动聊天室     │        │     信令聊天室       │    │
│  │  (Chatroom A)   │        │    (Chatroom B)     │    │
│  ├─────────────────┤        ├─────────────────────┤    │
│  │ • 用户弹幕消息   │        │ • 商品上架通知       │    │
│  │ • 用户互动消息   │        │ • 价格变动通知       │    │
│  │ • 普通文本消息   │        │ • 抽奖开始/结束      │    │
│  │ • 高频率、量大   │        │ • 禁言/解禁指令      │    │
│  │ • 可丢包、可延迟 │        │ • 高优先级、必达     │    │
│  └────────┬────────┘        └──────────┬──────────┘    │
│           │                            │               │
│           ▼                            ▼               │
│  ┌─────────────────────────────────────────────┐      │
│  │              消息分发处理器                   │      │
│  │         （根据消息类型路由到不同UI）           │      │
│  └─────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### 职责划分

| 聊天室 | 消息类型 | 处理方式 | 特点 |
|--------|----------|----------|------|
| **互动直播间** | 用户弹幕、互动消息 | 节流展示 | 消息量大、频率高、可丢包 |
| **信令直播间** | 商品通知、控制指令 | 立即处理 | 消息量少、高优先级、必达 |

### 消息分流示例

```typescript
// 统一消息入口，根据聊天室ID分流处理
EMClient.addEventHandler('RECEIVE_MESSAGE', {
  onTextMessage: (message: EasemobChat.TextMsgBody) => {
    if (message.to === roomId.value) {
      // 来自互动直播间 - 弹幕消息
      batchUpdate(message);
    }
  },
  onCustomMessage: (msg: EasemobChat.CustomMsgBody) => {
    if (msg.to === signalingRoomId.value) {
      // 来自信令直播间 - 业务信令
      handleBusinessSignal(msg);
    }
  },
  onCmdMessage: (msg: EasemobChat.CmdMsgBody) => {
    if (msg.to === signalingRoomId.value) {
      // 来自信令直播间 - 控制指令
      handleControlCommand(msg);
    }
  },
});
```

---

## 消息处理策略

### 普通模式

```typescript
import { useDebounceFn } from '@vueuse/core';

const messageContent = ref<string>('');

// 防抖发送（300ms）
const sendMessage = useDebounceFn(async () => {
  const options: EasemobChat.CreateTextMsgParameters = {
    to: roomId.value,
    type: 'txt',
    msg: messageContent.value,
    chatType: 'chatRoom',
    ext: {
      nickname: `${nickname}(${userId})`,
      role: rtcRole.value,
      timestamp: Date.now(),
      channelName: channelName.value
    }
  };
  
  try {
    const msg = WebSDK.message.create(options);
    const { message } = await EMClient.send(msg);
    messageList.value.push(message as EasemobChat.ExcludeAckMessageBody);
  } catch (error) {
    console.error('sendMessage error', error);
  } finally {
    messageContent.value = '';
  }
}, 300);
```

### 大型直播间模式

```typescript
// 定义发送间隔（1分钟）
const MESSAGE_SEND_INTERVAL = 60000;
let timer: NodeJS.Timeout | null = null;

const sendMessageInLargeMode = async () => {
  // 冷却期内：仅本地展示，不实际发送
  if (timer) {
    const createTextMsg: EasemobChat.CreateTextMsgParameters = {
      to: roomId.value,
      type: 'txt',
      msg: messageContent.value + '（LocalSend）',
      chatType: 'chatRoom',
      from: EMClient.context.userId,
      ext: {
        nickname: userId + '（本地）',
        timestamp: Date.now(),
        channelName: channelName.value,
        isLocal: true  // 标记为本地消息
      }
    };
    const msg = WebSDK.message.create(createTextMsg);
    messageList.value.push(msg as EasemobChat.ExcludeAckMessageBody);
    messageContent.value = '';
  } 
  // 冷却期外：正常发送并开启定时器
  else {
    sendMessage();
    timer = setTimeout(() => {
      timer = null;
    }, MESSAGE_SEND_INTERVAL);
  }
};
```

**大型直播间策略说明**:
- **冷却期（1分钟）**: 用户点击发送后，实际消息发送到服务器，同时开启1分钟冷却
- **冷却期内发送**: 消息仅在本地展示，标记为 `(LocalSend)`，不发送到服务器
- **目的**: 减少大型直播间的服务器压力和流量费用

### 功能特性对比

| 特性 | 普通模式 | 大型直播间模式 |
|------|----------|----------------|
| 消息发送 | 防抖 300ms | 1分钟冷却期 |
| 消息接收 | 实时接收 | 节流 500ms |
| 本地展示 | 无 | 冷却期内本地展示，标记 `(LocalSend)` |
| 成本优化 | 一般 | 显著减少服务器压力和流量费用 |

---

## API 参考

### 环信 SDK 核心 API

| API | 说明 |
|-----|------|
| `EMClient.open(params)` | 登录环信 IM |
| `EMClient.close()` | 关闭连接 |
| `EMClient.joinChatRoom(options)` | 加入聊天室 |
| `EMClient.send(message)` | 发送消息 |
| `EMClient.getHistoryMessages(options)` | 获取历史消息 |
| `EMClient.addEventHandler(name, handler)` | 添加事件监听 |
| `EMClient.removeEventHandler(name)` | 移除事件监听 |
| `EMClient.getRTCToken(channel)` | 获取 RTC Token |
| `WebSDK.message.create(options)` | 创建消息实例 |

### 事件监听类型

| 事件名称 | 说明 |
|----------|------|
| `CONNECTED` | 连接状态变化 |
| `RECEIVE_MESSAGE` | 接收消息（文本、自定义、命令） |
| `RECEIVED_SIGNALING_MESSAGE` | 接收信令消息 |

### 消息类型

| 类型 | 用途 | 示例场景 |
|------|------|----------|
| `txt` | 文本消息 | 用户弹幕 |
| `custom` | 自定义消息 | 商品上架通知 |
| `cmd` | 命令消息 | 禁言、踢人指令 |

---

## 配置说明

**文件路径**: `src/constants/modules/live-chatroom/index.ts`

```typescript
export const liveChatroomConfig = {
  // 用户配置
  user: {
    userId: 'your_user_id',
    nickname: 'your_nickname',
    password: 'your_password',     // 密码或 Token 二选一
    accessToken: 'your_token',
  },
  
  // 聊天室配置
  chatrooms: {
    // 信令聊天室 - 用于控制信令
    signaling: {
      roomId: 'signaling_room_id',
      roomName: '信令直播间',
    },
    // 互动聊天室 - 用于弹幕消息
    interactive: {
      roomId: 'interactive_room_id',
      roomName: '互动直播间',
    },
  },
  
  // RTC配置
  rtc: {
    channelName: 'live_channel_001',
    appId: '',  // 可选，Token 中已包含
  },
  
  // 环信IM配置
  im: {
    appKey: 'easemob-demo#support',
    apiUrl: 'https://a1.easemob.com',
    wsUrl: 'wss://im-api.easemob.com/ws',
  },
};
```

---

## 常见问题

### 1. 事件监听不生效？

确保使用正确的事件名称：
- ✅ `RECEIVE_MESSAGE`（正确）
- ❌ `RECEIVED_NEW_MESSAGE`（错误）

### 2. 如何获取 accessToken？

需要通过服务端调用环信 REST API 获取，或在环信控制台生成临时 Token 用于测试。

### 3. 消息发送失败？

检查以下几点：
- 是否已成功登录 IM
- 是否已加入目标聊天室
- 聊天室 ID 是否正确

### 4. 历史消息顺序错乱？

使用 `mergeAndSortMessages` 方法对消息进行合并排序，确保按时间戳正序排列。

### 5. 如何扩展消息类型？

在 `ext` 字段中添加自定义数据：

```typescript
const options = {
  to: roomId.value,
  type: 'txt',
  msg: '消息内容',
  chatType: 'chatRoom',
  ext: {
    nickname: '用户名',
    role: 'host',
    userLevel: 5,        // 用户等级
    avatar: 'url',       // 头像URL
    customData: {}       // 任意自定义数据
  }
};
```

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `src/easeim/index.ts` | 环信 IM SDK 初始化 |
| `src/easeim/live-rtc.ts` | RTC 封装类 |
| `src/views/emLiveChatroom/index.vue` | 直播间主页面 |
| `src/views/emLiveChatroom/config.vue` | 配置页面 |
| `src/views/emLiveChatroom/components/LiveRTC/index.vue` | RTC 视频组件 |
| `src/views/emLiveChatroom/components/LiveContainer/index.vue` | 直播容器组件 |
| `src/views/emLiveChatroom/components/DanmakuList/index.vue` | 弹幕列表组件 |
| `src/constants/modules/live-chatroom/index.ts` | 配置文件 |

---

*文档版本: 1.0*  
*更新日期: 2026-02-07*
