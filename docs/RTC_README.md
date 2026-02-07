# 声网 RTC 直播能力集成文档

本文档详细介绍如何在 Vue 3 项目中集成声网（Agora）RTC SDK 实现直播能力。

## 目录

- [架构概述](#架构概述)
- [技术栈](#技术栈)
- [H5 真机效果预览](#h5-真机效果预览)
- [快速开始](#快速开始)
- [核心组件详解](#核心组件详解)
  - [LiveRTC 组件](#livertc-组件)
  - [直播间主页面](#直播间主页面)
- [角色与权限](#角色与权限)
- [API 参考](#api-参考)
- [常见问题](#常见问题)

---

## 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                     直播间页面 (emLiveChatroom)               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              LiveContainer 容器组件                    │  │
│  │  ┌───────────────────────────────────────────────┐   │  │
│  │  │  LiveRTC 组件 - 音视频核心                     │   │  │
│  │  │  ┌─────────────────────────────────────────┐  │   │  │
│  │  │  │  主播: 本地视频预览 + 推流               │  │   │  │
│  │  │  │  观众: 接收远程视频流                    │  │   │  │
│  │  │  └─────────────────────────────────────────┘  │   │  │
│  │  └───────────────────────────────────────────────┘   │  │
│  │  ┌───────────────────────────────────────────────┐   │  │
│  │  │  DanmakuList 组件 - 弹幕显示                  │   │  │
│  │  └───────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**核心设计**：将 RTC 逻辑直接封装在 Vue 组件中，简化调用方式，优化资源释放。

---

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Vue | 3.x | 前端框架（Composition API） |
| TypeScript | 4.x+ | 类型支持 |
| Agora RTC SDK | ^4.24.2 | 声网音视频 SDK |
| Easemob WebSDK | latest | 环信即时通讯 SDK |

---

## H5 真机效果预览

### 直播间配置页面

![直播间配置页面](../src/assets/IMG_9320.PNG)

用户可配置：用户ID、昵称、角色（主播/观众）、频道名称等。

### 主播端界面

![主播端界面](../src/assets/IMG_9319.PNG)

- 🔴 **主播标识**：左上角红色标签
- 🟢 **连接状态**：RTC 和 IM 状态显示
- 📹 **本地视频**：全屏显示摄像头画面
- 💬 **弹幕区域**：底部显示观众消息

### 观众端界面

![观众端界面](../src/assets/IMG_9321.PNG)

- 🔵 **观众标识**：左上角蓝色标签
- 📺 **远程视频**：全屏显示主播画面

---

## 快速开始

### 1. 基础用法

```vue
<template>
  <LiveRTC 
    ref="rtcRef"
    :channel-name="channelName"
    :user-id="userId"
    :role="'host'"  <!-- 或 'audience' -->
    @joined="onJoined"
    @error="onError"
  />
</template>

<script setup>
import { ref, onMounted } from 'vue';
import LiveRTC from './components/LiveRTC/index.vue';

const rtcRef = ref(null);
const channelName = 'live_room_001';
const userId = 'user_001';

onMounted(async () => {
  // 1. 初始化 RTC
  await rtcRef.value?.initRTC();
  
  // 2. 加入频道
  await rtcRef.value?.joinChannel();
});

const onJoined = (channelId, uid) => {
  console.log('加入成功:', channelId, uid);
};

const onError = (error) => {
  console.error('错误:', error);
};
</script>
```

### 2. 完整直播间集成

参考 `src/views/emLiveChatroom/index.vue`，包含：
- RTC 音视频
- IM 弹幕聊天
- 双聊天室架构

---

## 核心组件详解

### LiveRTC 组件

**文件路径**: `src/views/emLiveChatroom/components/LiveRTC/index.vue`

#### 组件职责

| 角色 | 职责 |
|------|------|
| **主播 (host)** | 开启摄像头/麦克风，推送音视频流到服务器 |
| **观众 (audience)** | 接收并播放主播的音视频流 |

#### 使用流程

```
父组件调用 initRTC()
    ↓
主播：创建本地音视频轨道（开启摄像头/麦克风）
    ↓
父组件调用 joinChannel()
    ↓
加入 Agora 频道
    ↓
主播：publishLocalTracks() 发布流
    ↓
观众：handleUserPublished() 接收并播放流
    ↓
页面离开调用 destroy()
    ↓
停止轨道、释放摄像头/麦克风
```

#### Props

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `channelName` | `string` | ✅ | RTC 频道名称 |
| `userId` | `string` | ✅ | 用户ID |
| `role` | `'host' \| 'audience'` | 否 | 角色，默认 `'audience'` |
| `videoEnabled` | `boolean` | 否 | 是否开启视频，默认 `true` |
| `audioEnabled` | `boolean` | 否 | 是否开启音频，默认 `true` |

#### Events

| 事件 | 参数 | 说明 |
|------|------|------|
| `joined` | `(channelId: string, uid: number)` | 加入频道成功 |
| `left` | - | 离开频道 |
| `error` | `(error: Error)` | 发生错误 |
| `userPublished` | `(user, mediaType)` | 有用户发布流 |
| `userUnpublished` | `(user, mediaType)` | 用户停止发布流 |

#### Methods（通过 ref 调用）

```typescript
// 初始化 RTC 客户端
await rtcRef.value?.initRTC()

// 加入频道
await rtcRef.value?.joinChannel()

// 离开频道（保留实例）
await rtcRef.value?.leaveChannel()

// 完全销毁（页面离开时调用）
await rtcRef.value?.destroy()

// 获取当前状态
const state = rtcRef.value?.getState()
```

#### 资源释放机制

```typescript
// 关键：离开页面时确保释放摄像头/麦克风
const destroy = async () => {
  // 1. 取消发布
  await unpublishLocalTracks()
  
  // 2. 停止轨道 ⭐ 释放摄像头/麦克风
  await stopLocalTracks()
  
  // 3. 离开频道
  await rtcClient.value?.leave()
  
  // 4. 移除监听
  rtcClient.value?.off('user-published', ...)
  rtcClient.value?.off('user-unpublished', ...)
  
  // 5. 清空引用
  rtcClient.value = null
}
```

---

### 直播间主页面

**文件路径**: `src/views/emLiveChatroom/index.vue`

#### 核心功能

1. **配置加载**：从 localStorage 读取用户配置
2. **IM 连接**：登录环信 IM，加入双聊天室
3. **RTC 管理**：调用 LiveRTC 组件方法
4. **消息处理**：发送和接收弹幕

#### 代码结构

```typescript
// ========== 1. 配置加载 ==========
const liveConfig = { user: {...}, chatrooms: {...}, rtc: {...} }

// ========== 2. IM 事件监听 ==========
const setupIMListeners = () => {
  // IM 连接成功后，初始化 RTC
  EMClient.addEventHandler('CONNECTED', {
    onConnected: async () => {
      await rtcRef.value?.initRTC()
      await rtcRef.value?.joinChannel()
    }
  })
}

// ========== 3. 消息管理 ==========
const messageList = ref([])
const sendMessage = useDebounceFn(async () => {
  // 发送弹幕消息
}, 300)

// ========== 4. 资源清理 ==========
const goToHome = async () => {
  await rtcRef.value?.destroy()  // 销毁 RTC
  EMClient.close()                // 关闭 IM
  router.push('/home')
}
```

---

## 角色与权限

| 功能 | 主播 (host) | 观众 (audience) |
|------|-------------|-----------------|
| 开启摄像头 | ✅ | ❌ |
| 开启麦克风 | ✅ | ❌ |
| 推送音视频流 | ✅ | ❌ |
| 接收音视频流 | ✅ | ✅ |
| 发送弹幕 | ✅ | ✅ |

---

## API 参考

### Agora RTC SDK 核心 API

```typescript
// 创建客户端
const client = AgoraRTC.createClient({ mode: 'live', codec: 'h264' })

// 设置角色
await client.setClientRole('host')  // 或 'audience'

// 创建本地轨道
const audioTrack = await AgoraRTC.createMicrophoneAudioTrack()
const videoTrack = await AgoraRTC.createCameraVideoTrack()

// 加入频道
await client.join(token, channelName, null, uid)

// 发布本地流
await client.publish([audioTrack, videoTrack])

// 订阅远程流
await client.subscribe(user, mediaType)

// 离开频道
await client.leave()
```

---

## 常见问题

### Q1: 离开页面后摄像头灯还亮着？

**原因**：本地音视频轨道未正确关闭。

**解决**：确保调用 `destroy()` 方法，它会依次执行：
1. `unpublishLocalTracks()` - 取消发布
2. `stopLocalTracks()` - 停止并关闭轨道
3. `client.leave()` - 离开频道

### Q2: 主播看不到自己的预览画面？

**原因**：视频元素未渲染完成就开始播放。

**解决**：使用 `setTimeout` 延迟播放，或等待 `nextTick()`：

```typescript
await nextTick()
setTimeout(() => {
  if (localVideoRef.value && localVideoTrack.value) {
    playLocalVideo(localVideoRef.value)
  }
}, 200)
```

### Q3: 观众看不到主播画面？

**排查步骤**：
1. 检查主播是否成功 `publishLocalTracks()`
2. 检查观众是否收到 `user-published` 事件
3. 检查是否正确订阅 `client.subscribe(user, 'video')`
4. 检查视频元素是否正确绑定

### Q4: 如何切换角色？

```typescript
// 1. 离开当前频道
await rtcRef.value?.leaveChannel()

// 2. 修改角色
props.role = 'host'  // 或 'audience'

// 3. 重新初始化并加入
await rtcRef.value?.initRTC()
await rtcRef.value?.joinChannel()
```

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `LiveRTC/index.vue` | RTC 核心组件 |
| `LiveRTC/types.ts` | TypeScript 类型定义 |
| `emLiveChatroom/index.vue` | 直播间主页面 |
| `emLiveChatroom/config.vue` | 配置页面 |

---

*文档版本: 2.0*  
*更新日期: 2026-02-07*  
*变更：重构 RTC 逻辑到组件内，优化资源释放*
