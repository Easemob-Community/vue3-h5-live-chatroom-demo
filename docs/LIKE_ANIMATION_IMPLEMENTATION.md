# 直播间点赞飘浮动画实现思路文档

## 一、需求概述

在现有 Vue3 H5 直播间中，增加右下角 **点赞飘浮动画** 效果组件，实现以下核心能力：

1. **IM 驱动动画**：互动聊天室收到服务端聚合下发的 CMD 命令消息（`action: 'like'`）时，根据 `ext.like_number` 动态触发 emoji 飘浮动画；
2. **用户点击点赞**：观众点击右下角点赞按钮，本地即时展示飘浮动画，同时做点击聚合上报；
3. **配置可控**：由 `config.vue` 控制点赞动画的显隐；
4. **上报预留**：组件内部预留上报接口，支持用户传入自定义上报函数。

> **关键设计决策**：点赞 CMD 消息走**互动聊天室**下发，不走信令聊天室。

---

## 二、整体架构

### 2.1 双聊天室职责划分

本项目采用**双聊天室架构**，点赞消息明确归属如下：

| 聊天室 | 职责 | 消息特征 | 可靠性要求 |
|--------|------|----------|-----------|
| **互动聊天室** | 弹幕、点赞、礼物、进场欢迎等**高频互动消息** | 高并发、可聚合、允许轻微延迟 | **可接受丢失**（at-most-once） |
| **信令聊天室** | 连麦邀请、开关播、踢人、禁言等**控制信令** | 低频、必须可靠、实时性高 | **不可丢失**（at-least-once） |

**为什么点赞要走互动聊天室？**

- **频率匹配**：点赞是超高频操作，需要服务端聚合后高频广播（1~5 条/秒），互动聊天室的设计目标就是承载这类消息；
- **可靠性匹配**：点赞属于"可级"更新——丢一两条不影响用户体验，下一波广播会补上；信令聊天室若被大量点赞消息填满，真正的控制信令会被挤占或延迟；
- **广播成本**：互动聊天室通常针对"在线观众"优化广播效率，而信令聊天室参与者更少（可能只有主播+几个管理员），滥用会造成资源浪费。

### 2.2 组件布局架构

```
┌─────────────────────────────────────────────────────────────┐
│                      直播间主页面 (index.vue)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              LiveContainer (布局容器)                  │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────┐          │  │
│  │  │ rtc层   │  │弹幕层   │  │ 点赞动画层  │  z-index  │  │
│  │  │ z:10    │  │ z:20    │  │ z:25        │          │  │
│  │  └─────────┘  └─────────┘  └─────────────┘          │  │
│  │  ┌─────────────┐  ┌─────────────────────────┐       │  │
│  │  │ 顶部控制层  │  │ 底部控制层（发送弹幕）   │       │  │
│  │  │ z:110       │  │ z:100                   │       │  │
│  │  └─────────────┘  └─────────────────────────┘       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  互动聊天室 IM 流 ──▶ onCmdMessage('like') ──▶ LikeAnimation │
│  用户点击 ───▶ LikeAnimation 本地展示 + 聚合上报             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、核心组件设计

### 3.1 LikeAnimation 组件

**位置**：`src/views/emLiveChatroom/components/LikeAnimation/index.vue`

#### 职责划分

| 模块 | 职责 |
|------|------|
| 飘浮动画层 (`floating-layer`) | 绝对定位覆盖层，动态创建/销毁飘浮 emoji DOM，执行 CSS 关键帧动画 |
| 点赞按钮 (`like-button`) | 右下角圆形按钮，支持点击、按压反馈、连击计数、总点赞数展示 |
| 聚合上报模块 | 管理用户点击的聚合计时器，达到间隔后批量 flush 到 `reportApi` |

#### 核心 Props

```ts
interface LikeAnimationProps {
  visible?: boolean;              // 显隐控制
  reportApi?: (count: number) => Promise<void> | void;  // 上报接口（用户传入）
  aggregateInterval?: number;     // 点击聚合间隔，默认 500ms
  emojis?: string[];              // 自定义飘浮 emoji 列表
  maxFloatCount?: number;         // 单批次最大飘浮数量，默认 50
  maxGlobalFloatCount?: number;   // 全局同时存在的最大飘浮 emoji 数量，默认 80
  disabledClickReport?: boolean;  // 是否禁用点击上报
}
```

#### 核心方法 (expose)

- `triggerLike(count: number)`：外部驱动，根据数量生成飘浮 emoji。
  - 小数量（`<= 10`）直接生成对应个数；
  - 大数量采用**对数增长**计算生成数量，上限 `maxFloatCount`；
  - 受全局 DOM 上限 `maxGlobalFloatCount` 保护，防止内存/性能爆炸；
  - 每个 emoji 拥有独立的：起始 X 位置、动画时长、大小、延迟、摇摆方向/幅度。

- `flushPendingClicks()`：强制刷新待上报的点击数量。

#### 飘浮动画实现（CSS 关键帧）

```css
@keyframes float-up {
  0%   { opacity: 1;   transform: translateY(0)    scale(0.6) rotate(0deg); }
  15%  { opacity: 1;   transform: translateY(-60px) scale(1.15) rotate(12deg); }
  40%  { opacity: 0.9; transform: translateY(-150px) scale(1.05) rotate(-6deg); }
  70%  { opacity: 0.5; transform: translateY(-280px) scale(0.85) rotate(10deg); }
  100% { opacity: 0;   transform: translateY(-420px) scale(0.5) rotate(0deg); }
}
```

动画特点：
- **上升轨迹**：从底部向上直线移动，伴随 **左右摇摆**（贝塞尔式曲线感）；
- **生命周期**：透明度从 1 → 0，缩放从 0.6 → 1.15 → 0.5；
- **性能**：纯 CSS 动画，由 GPU 合成层处理；动画结束后通过 `setTimeout` 自动移除 DOM。

#### 点击聚合上报逻辑

```
用户点击
  │
  ▼
本地立即展示 1 个飘浮 emoji（即时反馈）
  │
  ▼
pendingClickCount++
  │
  ├── 重置聚合计时器 (aggregateInterval = 500ms)
  │
  └── 500ms 内无新点击 ──▶ flushPendingClicks()
                                │
                                ▼
                          调用 props.reportApi(count)
                                │
                          ┌─────┴─────┐
                          ▼           ▼
                      上报成功      上报失败
                      emit success  emit fail
```

设计考量：
- **即时反馈**：点击后立即展示动画，不等待上报；
- **防刷保护**：高频点击在 500ms 窗口内聚合成一次网络请求；
- **页面卸载兜底**：`onUnmounted` 中强制 `flushPendingClicks`，避免点赞丢失。

---

## 四、IM 消息接入（互动聊天室）

### 4.1 CMD 消息格式（环信 Easemob）

**发送端**（服务端向互动聊天室下发聚合点赞）：

```bash
curl --location 'https://XXXX/XXXX/XXXX/messages/chatrooms' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer <YourAppToken>' \
--data '{
  "from": "system",
  "to": ["互动聊天室ID"],
  "type": "cmd",
  "body": { "action": "like" },
  "ext": { "like_number": "55" }
}'
```

> **注意**：`to` 字段应填写**互动聊天室 ID**，而非信令聊天室 ID。

**接收端**（Web SDK `EasemobChat.CmdMsgBody`）：

```ts
interface CmdMsgBody {
  type: 'cmd';
  action: string;           // "like"
  ext?: Record<string, any>;
  // ext.like_number = "55"
}
```

### 4.2 互动直播间消息监听改造

在 `index.vue` 的**互动聊天室**消息监听器中，新增 `onCmdMessage`：

```ts
EMClient.addEventHandler('RECEIVE_MESSAGE', {
  onTextMessage: (message) => { /* 原有弹幕逻辑 */ },
  onCmdMessage: (message) => {
    if (message.to === roomId.value) {
      handleInteractiveCmdMessage(message);
    }
  },
});
```

**CMD 消息处理函数**：

```ts
const handleInteractiveCmdMessage = (msg: EasemobChat.CmdMsgBody) => {
  const action = msg.action || '';
  const isLikeAction = action === 'like' || action === 'Like' || action === 'LIKE';
  if (!isLikeAction) return;

  const ext = (msg.ext || {}) as Record<string, any>;
  const likeNumberRaw = ext.like_number || ext.likeNumber || ext.like_count || '1';
  const likeNumber = parseInt(String(likeNumberRaw), 10) || 1;

  // 驱动点赞动画
  likeAnimationRef.value?.triggerLike(likeNumber);
};
```

兼容性处理：
- `action` 大小写兼容（`like` / `Like` / `LIKE`）；
- `ext` 字段兼容多种命名（`like_number`、`likeNumber`、`like_count`）。

---

## 五、配置层集成

### 5.1 config.vue 新增配置项

在「互动特效配置」分组中增加开关：

```vue
<van-cell-group title="互动特效配置">
  <van-cell title="点赞飘浮动画">
    <template #right-icon>
      <van-switch v-model="form.showLikeAnimation" ... />
    </template>
  </van-cell>
</van-cell-group>
```

### 5.2 直播间读取配置

```ts
const showLikeAnimation = ref(savedConfig?.showLikeAnimation !== false);
```

默认开启，若用户手动关闭则保存到 `localStorage`，下次进入直播间时生效。

---

## 六、上报接口预留

组件内部通过 `reportApi` prop 解耦具体上报实现，由业务方注入：

```vue
<LikeAnimation
  :report-api="handleLikeReport"
  @report-success="handleReportSuccess"
  @report-fail="handleReportFail"
/>
```

### 6.1 默认上报函数（预留示例）

```ts
const handleLikeReport = async (count: number): Promise<void> => {
  // TODO: 替换为真实业务接口
  // await fetch('https://your-api.com/api/live/like', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ roomId: roomId.value, userId: userId.value, count }),
  // });
};
```

### 6.2 事件回调

| 事件 | 时机 | 用途 |
|------|------|------|
| `like-click` | 用户每次点击 | 日志、本地统计 |
| `report-success` | 聚合上报成功 | 提示用户、更新本地状态 |
| `report-fail` | 聚合上报失败 | 重试、降级处理 |

---

## 七、性能与体验优化

| 优化点 | 实现方式 |
|--------|----------|
| **全局 DOM 上限** | `maxGlobalFloatCount = 80`，跨批次共享计数器，任何时候同时存在的 emoji 不超过 80 个 |
| **纯 CSS 动画** | 飘浮动画使用 `@keyframes`，由浏览器合成层处理，避免 JS 频繁操作样式 |
| **自动清理** | 动画结束后 `setTimeout` 移除 DOM，防止内存泄漏 |
| **错峰生成** | 大批量点赞时，通过 `densityFactor` 动态缩短延迟，既保证爆发感又不堆积 |
| **页面可见性感知** | 切后台时暂停创建动画，并立即 flush 待上报数据，省电防丢 |
| **低端设备降级** | 检测内存 `<= 4GB` 或 CPU 核心 `<= 4` 时，只更新数字不渲染动画，保流畅 |
| **连击反馈** | 1.5s 内连续点击显示 `combo-hint`（x3 / x5 / x10...），增强互动爽感 |
| **按压反馈** | 按钮 `:active` / `touchstart` 时缩放 0.92，提供触觉暗示 |

---

## 八、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/views/emLiveChatroom/components/LikeAnimation/index.vue` | 新增 | 点赞飘浮动画核心组件 |
| `src/views/emLiveChatroom/components/LiveContainer/index.vue` | 修改 | 新增 `like-animation` 插槽及样式 |
| `src/views/emLiveChatroom/index.vue` | 修改 | 引入组件、在互动聊天室监听 `onCmdMessage`、处理点赞上报 |
| `src/views/emLiveChatroom/config.vue` | 修改 | 新增 `showLikeAnimation` 配置开关 |
| `docs/LIKE_ANIMATION_IMPLEMENTATION.md` | 新增 | 本实现思路文档 |

---

## 九、扩展建议

### 9.1 双聊天室消息类型规划建议

为确保长期可维护性，建议严格区分双聊天室的消息类型：

| 消息类型 | 所属聊天室 | 说明 |
|----------|-----------|------|
| 弹幕（txt） | 互动聊天室 | 高频，可聚合展示 |
| 点赞 CMD | 互动聊天室 | 高频，服务端聚合后广播 |
| 礼物 CMD | 互动聊天室 | 中频，全屏特效 +
| 进场欢迎 CMD | 互动聊天室 | 中频，可降级丢弃 |
| 连麦邀请 CMD | **信令聊天室** | 低频，必须可靠到达 |
| 开关播通知 | **信令聊天室** | 低频，控制级消息 |
| 踢人/禁言 CMD | **信令聊天室** | 低频，权限控制 |

### 9.2 服务端聚合策略

实际生产环境中，服务端应对短时间内的大量点赞进行聚合（如 **1s 窗口**），通过 CMD 消息批量下发到**互动聊天室**，减少客户端渲染压力和 IM 消息流量。

推荐广播频率：**1~5 条/秒/房间**，根据房间热度动态调整。

### 9.3 其他扩展方向

1. **点赞排行榜**：可将 `displayCount` 接入服务端真实数据，展示直播间总点赞数；
2. **礼物动效扩展**：`LikeAnimation` 的架构可复用于礼物飘屏、进入直播间特效等高优先级消息；
3. **Canvas 渲染升级**：超大规模直播间（10万+人）可将 DOM 动画升级为 Canvas 粒子系统，同屏可渲染数百个点赞；
4. **WebSocket 心跳**：上报接口可改为 WebSocket 长连接发送，进一步降低延迟。
