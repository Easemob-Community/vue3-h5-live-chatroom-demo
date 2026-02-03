# IM集成实现直播间弹幕功能文档

## 一、概述

本文档详细介绍如何在 Vue3 项目中集成环信（Easemob）IM SDK，实现直播间弹幕功能。包括普通模式和大型直播间模式两种场景的消息处理策略。

## 二、技术栈

- **前端框架**: Vue 3 + TypeScript
- **IM SDK**: easemob-websdk
- **UI 组件库**: Vant
- **工具库**: VueUse (useThrottleFn, useDebounceFn)
- **虚拟列表**: vue-virtual-scroller (DynamicScroller)

## 三、项目结构

```
src/
├── easeim/
│   └── index.ts              # 环信 SDK 初始化配置
├── views/
│   └── emLiveChatroom/
│       ├── index.vue         # 直播间主页面
│       └── components/
│           └── DanmakuList/
│               └── index.vue # 弹幕列表组件
```

## 四、环信 SDK 初始化

### 4.1 SDK 配置 (`src/easeim/index.ts`)

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
  appKey: 'easemob-demo#support',  // 替换为你的 App Key
});

export { WebSDK, EMClient, EasemobChat, EasemobChatStatic };
```

**要点说明**:
- `appKey`: 在环信控制台创建应用后获取
- 日志级别根据环境自动切换，便于调试和线上问题排查

## 五、直播间主页面实现

### 5.1 页面结构 (`src/views/emLiveChatroom/index.vue`)

```vue
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
      <!-- 视频播放组件 -->
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
```

### 5.2 核心逻辑实现

#### 5.2.1 路由参数获取

```typescript
import { useRoute } from 'vue-router';

const route = useRoute();
const userId = ref<string>('');
const roomId = ref<string>('');
const accessToken = ref<string>('');

watchEffect(() => {
  if (route.query.userId && route.query.roomId && route.query.token) {
    userId.value = route.query.userId as string;
    roomId.value = route.query.roomId as string;
    accessToken.value = route.query.token as string;
  }
});
```

#### 5.2.2 事件监听配置

```typescript
// 连接状态监听
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

// 文本消息监听
const mountEMMessageListener = () => {
  EMClient.addEventHandler('RECEIVED_NEW_MESSAGE', {
    onTextMessage: (message: EasemobChat.TextMsgBody) => {
      batchUpdate(message);
    },
  });
};

// 信令消息监听（自定义消息、命令消息）
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
```

#### 5.2.3 登录与加入直播间

```typescript
// 环信登录
const loginIM = async () => {
  try {
    await EMClient.open({
      user: userId.value,
      accessToken: accessToken.value,
    });
    
    // 登录成功后加入直播间
    await joinLiveSignalingChatroom();  // 加入信令直播间
    await joinLiveChatroom();           // 加入互动直播间
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
```

#### 5.2.4 获取历史消息

```typescript
const messageList = ref<EasemobChat.ExcludeAckMessageBody[]>([]);

const fetchLiveChatroomHistoryMessages = async () => {
  try {
    const res = await EMClient.getHistoryMessages({
      targetId: roomId.value,
      chatType: 'chatRoom',
      cursor: null,
      pageSize: 10,
    });
    
    if (res?.messages?.length > 0) {
      // 反转消息顺序并按时间正序排列
      messageList.value = [
        ...(res.messages.reverse() as EasemobChat.ExcludeAckMessageBody[]), 
        ...messageList.value
      ];
    }
  } catch (error) {
    console.error('fetchChatroomMessages error', error);
  }
};
```

### 5.3 消息发送策略

#### 5.3.1 普通模式 - 防抖发送

```typescript
import { useDebounceFn } from '@vueuse/core';

const messageContent = ref<string>('');
const MAX_MESSAGES_LIST = 30;

const sendMessage = useDebounceFn(async () => {
  const options: EasemobChat.CreateTextMsgParameters = {
    to: roomId.value,
    type: 'txt',
    msg: messageContent.value,
    chatType: 'chatRoom',
    ext: {
      nickname: 'xxxxx'  // 扩展字段，可携带用户信息
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

#### 5.3.2 大型直播间模式 - 节流控制

```typescript
import { useThrottleFn } from '@vueuse/core';

// 接收消息节流处理（500ms内只更新一次）
const batchUpdate = useThrottleFn((message) => {
  // 限制消息列表长度，超过则删除最早的消息
  if (messageList.value.length > MAX_MESSAGES_LIST) {
    messageList.value.shift();
  }
  messageList.value.push(message);
}, 500);

// 大型直播间发送策略
let timer: NodeJS.Timeout | null = null;
const MESSAGE_SEND_INTERVAL = 60000; // 1分钟

const sendMessageInLargeMode = async () => {
  // 冷却期内：仅本地展示，不实际发送
  if (timer) {
    const createTextMsg: EasemobChat.CreateTextMsgParameters = {
      to: roomId.value,
      type: 'txt',
      msg: messageContent.value + '（LocalSend）',
      chatType: 'chatRoom',
      from: EMClient.context.userId,
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

### 5.4 生命周期管理

```typescript
onMounted(() => {
  loginIM();
});

onUnmounted(() => {
  EMClient.close();  // 关闭连接
  // 移除事件监听
  EMClient.removeEventHandler('CONNECTED');
  EMClient.removeEventHandler('RECEIVED_NEW_MESSAGE');
});
```

## 六、双直播间架构设计

### 6.1 为什么需要双直播间

在大型直播场景中，单一直播间架构面临以下挑战：

| 问题 | 说明 |
|------|------|
| **消息量巨大** | 弹幕互动聊天室用户活跃，消息频率极高，可能导致消息堆积和延迟 |
| **信令可靠性** | 电商直播中的商品上架、价格变动、抽奖开始等重要通知需要确保送达 |
| **优先级冲突** | 弹幕消息可能淹没重要信令，导致关键信息被遗漏 |
| **性能瓶颈** | 大量弹幕消息处理会占用客户端和网络资源，影响信令接收 |

### 6.2 双直播间架构方案

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

### 6.3 两个直播间的职责划分

#### 互动直播间（Chatroom A）

```typescript
// 加入互动直播间
const joinLiveChatroom = async () => {
  try {
    await EMClient.joinChatRoom({
      roomId: roomId.value,  // 互动直播间ID
      message: '加入互动直播间',
    });
  } catch (error) {
    console.error('joinChatroom error', error);
  }
};

// 监听互动消息
const mountEMMessageListener = () => {
  EMClient.addEventHandler('RECEIVED_NEW_MESSAGE', {
    onTextMessage: (message: EasemobChat.TextMsgBody) => {
      // 处理用户弹幕，展示在弹幕列表
      batchUpdate(message);
    },
  });
};
```

**特点**：
- 承载用户弹幕、互动消息
- 消息量大、频率高
- 使用节流策略处理，允许一定丢包
- 关注实时性，但可接受偶尔延迟

#### 信令直播间（Chatroom B）

```typescript
// 加入信令直播间
const joinLiveSignalingChatroom = async () => {
  try {
    await EMClient.joinChatRoom({
      roomId: 'signaling_room_id',  // 信令直播间ID
      message: '加入信令聊天室',
    });
  } catch (error) {
    console.error('joinSignalingRoom error', error);
  }
};

// 监听信令消息
const mountEMSignalingChatroomListener = () => {
  EMClient.addEventHandler('RECEIVED_NEW_MESSAGE', {
    onCustomMessage(msg: EasemobChat.CustomMsgBody) {
      // 处理业务信令，如商品上架、价格变动
      handleBusinessSignal(msg);
    },
    onCmdMessage(msg: EasemobChat.CmdMsgBody) {
      // 处理控制指令，如禁言、踢人
      handleControlCommand(msg);
    },
  });
};
```

**特点**：
- 承载业务信令、控制指令
- 消息量少、但关键
- 每条消息都必须可靠送达
- 通常采用自定义消息或命令消息类型

### 6.4 典型应用场景

#### 电商直播场景

| 消息类型 | 所属聊天室 | 处理方式 | 示例 |
|---------|-----------|---------|------|
| 用户弹幕 | 互动直播间 | 节流展示 | "这个产品不错！" |
| 商品上架通知 | 信令直播间 | 立即弹窗 | `{type: 'product_on_shelf', data: {...}}` |
| 限时折扣提醒 | 信令直播间 | 倒计时组件 | `{type: 'flash_sale', endTime: ...}` |
| 抽奖开始 | 信令直播间 | 弹窗参与 | `{type: 'lottery_start', lotteryId: ...}` |
| 中奖结果 | 信令直播间 | 全屏动画 | `{type: 'lottery_result', winner: ...}` |
| 禁言用户 | 信令直播间 | 执行禁言 | `{type: 'mute_user', userId: ...}` |

#### 消息分流示例

```typescript
// 统一消息入口，根据聊天室ID分流处理
EMClient.addEventHandler('RECEIVED_NEW_MESSAGE', {
  onTextMessage: (message: EasemobChat.TextMsgBody) => {
    if (message.to === roomId.value) {
      // 来自互动直播间 - 弹幕消息
      danmakuList.value.push(message);
    }
  },
  onCustomMessage: (msg: EasemobChat.CustomMsgBody) => {
    if (msg.to === 'signaling_room_id') {
      // 来自信令直播间 - 业务信令
      handleBusinessSignal(msg);
    }
  },
  onCmdMessage: (msg: EasemobChat.CmdMsgBody) {
    if (msg.to === 'signaling_room_id') {
      // 来自信令直播间 - 控制指令
      handleControlCommand(msg);
    }
  },
});
```

### 6.5 架构优势

1. **隔离性**：弹幕消息风暴不会影响信令传输
2. **可靠性**：重要信令在独立的低流量通道传输，确保送达
3. **灵活性**：两个聊天室可以独立配置不同的消息策略
4. **可扩展性**：未来可以增加更多专用聊天室（如礼物特效、系统公告等）

### 6.6 弹幕列表组件

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
        <div class="danmaku-item">{{ item.from }}： {{ item.msg }}</div>
      </DynamicScrollerItem>
    </template>
  </DynamicScroller>
</template>

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

## 七、功能特性总结

### 7.1 普通模式

| 特性 | 说明 |
|------|------|
| 消息发送 | 防抖 300ms，避免频繁点击 |
| 消息接收 | 实时接收，立即展示 |
| 消息数量 | 限制最多 30 条，超出删除最早消息 |
| 历史消息 | 进入直播间时自动加载 10 条 |

### 7.2 大型直播间模式

| 特性 | 说明 |
|------|------|
| 消息发送 | 1分钟冷却期，期间仅本地展示 |
| 消息接收 | 节流 500ms，批量更新减少 DOM 操作 |
| 本地展示 | 冷却期内发送的消息标记 `(LocalSend)` |
| 成本优化 | 显著减少服务器压力和流量费用 |

## 八、使用说明

### 8.1 路由参数

进入直播间需要携带以下参数：

```
/emLiveChatroom?userId={用户ID}&roomId={房间ID}&token={访问令牌}
```

### 8.2 依赖安装

```bash
# 安装环信 SDK
npm install easemob-websdk

# 安装 VueUse
npm install @vueuse/core

# 安装虚拟列表组件
npm install vue-virtual-scroller
```

### 8.3 环境配置

在项目 `.env` 文件中配置：

```
# 开发环境
NODE_ENV=development

# 生产环境
NODE_ENV=production
```

## 九、注意事项

1. **App Key**: 确保使用正确的环信 App Key
2. **Token 获取**: 需要通过服务端获取用户 accessToken
3. **聊天室创建**: 确保房间 ID 对应的聊天室已存在
4. **性能优化**: 大型直播间建议开启节流模式
5. **内存管理**: 组件卸载时及时清理事件监听和定时器

## 十、扩展建议

1. **消息类型扩展**: 可支持图片、表情等富媒体消息
2. **用户等级**: 在 `ext` 字段中携带用户等级信息，展示不同样式
3. **禁言功能**: 通过 `onCmdMessage` 接收禁言指令
4. **礼物消息**: 使用自定义消息类型实现礼物特效
5. **消息撤回**: 监听撤回命令消息，从列表中移除对应消息
