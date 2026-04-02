# LiveMessageAggregator 消息聚合器

## 一、概述

`LiveMessageAggregator` 是一个通用的消息聚合工具，用于将高频消息流按时间窗口聚合为批次输出。主要解决以下问题：

- **消息洪泛**：高频消息直接渲染导致 UI 卡顿
- **批量处理**：将离散消息聚合成批次，减少渲染次数
- **优先级调度**：高优先级消息可立即通过，普通消息按周期聚合

## 二、设计思路

### 2.1 核心问题

直播场景中，弹幕消息可能以极高频率涌入（每秒数百条），若每条消息都触发一次 UI 更新，会导致：

1. 频繁的 DOM 操作，造成页面卡顿
2. Vue 响应式系统频繁触发依赖更新
3. 动画队列堆积，用户体验差

### 2.2 解决方案

**时间窗口聚合**：在固定时间窗口内收集消息，达到阈值或超时后批量输出。

```
消息流 → [缓冲区] → 定时器/阈值触发 → 批次输出
  ↓
[msg1, msg2, msg3, ...] → 1秒后 → { messages: [...], count: N, timestamp }
```

### 2.3 架构设计

采用**单一职责**原则，分离关注点：

```
┌─────────────────────────────────────────────────────────────┐
│                  PriorityMessageAggregator                   │
│  ┌─────────────────┐    ┌─────────────────────────────┐    │
│  │ isPriority 判断  │    │    MessageAggregator        │    │
│  │                 │    │  ┌───────────────────────┐  │    │
│  │ 高优先级 ────────┼───→│  │ onPriority callback   │  │    │
│  │                 │    │  └───────────────────────┘  │    │
│  │ 普通消息 ────────┼───→│  buffer + timer           │    │
│  │                 │    │         ↓                  │    │
│  │                 │    │  onBatch callback          │    │
│  └─────────────────┘    └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 三、类设计详解

### 3.1 MessageAggregator（基础聚合器）

**职责**：纯聚合逻辑，无业务耦合

```typescript
class MessageAggregator<T> {
  // 配置项
  interval: number; // 聚合周期，默认 1000ms
  maxBatch: number; // 单批上限，默认 50

  // 内部状态
  buffer: T[]; // 消息缓冲区
  timer: Timeout; // 定时器

  // IO 接口
  add(message): void; // 添加单条
  addBatch(messages): void; // 批量添加
  flush(): void; // 立即刷新
  onBatch(callback): void; // 订阅批次
  getBufferedCount(): number; // 获取缓冲数量
  destroy(): void; // 销毁
}
```

**刷新策略**：

1. **阈值触发**：`buffer.length >= maxBatch` 时立即刷新
2. **定时触发**：首个消息入队后启动定时器，到期刷新
3. **手动触发**：调用 `flush()` 立即刷新

### 3.2 PriorityMessageAggregator（优先级聚合器）

**职责**：在基础聚合器之上增加优先级调度

```typescript
class PriorityMessageAggregator<T> {
  // 组合基础聚合器
  normalAggregator: MessageAggregator<T>;

  // 优先级配置
  isPriorityFn?: (message: T) => boolean;

  // IO 接口（扩展）
  add(message): void; // 自动判断优先级
  onPriority(callback): void; // 订阅高优先级消息
  onBatch(callback): void; // 订阅普通批次
}
```

**消息路由**：

```
message → isPriority(message)?
              ↓ Yes        ↓ No
        onPriority()    aggregator.add()
                              ↓
                         onBatch()
```

### 3.3 类型定义

```typescript
// 聚合器配置
interface AggregatorOptions {
  interval?: number; // 聚合周期（毫秒）
  maxBatch?: number; // 单批上限
}

// 优先级聚合器配置
interface PriorityAggregatorOptions extends AggregatorOptions {
  isPriority?: (message: any) => boolean;
}

// 消息批次
interface MessageBatch<T = any> {
  messages: T[]; // 批次消息
  count: number; // 消息数量
  timestamp: number; // 批次时间戳
}
```

## 四、使用示例

### 4.1 基础用法

```typescript
import { MessageAggregator } from './LiveMessageAggregator';

// 1. 创建聚合器
const aggregator = new MessageAggregator({
  interval: 1000, // 每 1 秒输出一次
  maxBatch: 50, // 最多 50 条一批
});

// 2. 订阅批次
aggregator.onBatch((batch) => {
  console.log(`收到 ${batch.count} 条消息`);
  batch.messages.forEach((msg) => renderDanmaku(msg));
});

// 3. 添加消息
socket.on('message', (msg) => {
  aggregator.add(msg);
});

// 4. 销毁（组件卸载时）
onUnmounted(() => {
  aggregator.destroy();
});
```

### 4.2 Vue 3 组合式集成

```typescript
import { ref, onUnmounted } from 'vue';
import { MessageAggregator, MessageBatch } from './LiveMessageAggregator';

export function useDanmakuAggregator() {
  const danmakuList = ref<Danmaku[]>([]);

  const aggregator = new MessageAggregator<Danmaku>({
    interval: 500,
    maxBatch: 30,
  });

  aggregator.onBatch((batch: MessageBatch<Danmaku>) => {
    // 批量更新响应式数据，只触发一次渲染
    danmakuList.value.push(...batch.messages);
  });

  const addDanmaku = (danmaku: Danmaku) => {
    aggregator.add(danmaku);
  };

  onUnmounted(() => {
    aggregator.destroy();
  });

  return { danmakuList, addDanmaku };
}
```

### 4.3 优先级调度

```typescript
import { PriorityMessageAggregator } from './LiveMessageAggregator';

// 创建优先级聚合器
const aggregator = new PriorityMessageAggregator({
  interval: 1000,
  maxBatch: 50,

  // 定义高优先级消息
  isPriority: (msg) => {
    return msg.type === 'gift' || msg.type === 'system';
  },
});

// 订阅高优先级消息（立即处理）
aggregator.onPriority((msg) => {
  showGiftAnimation(msg); // 礼物立即显示动画
});

// 订阅普通消息批次
aggregator.onBatch((batch) => {
  renderDanmakuList(batch.messages); // 弹幕批量渲染
});

// 使用
socket.on('message', (msg) => {
  aggregator.add(msg); // 自动路由
});
```

### 4.4 手动刷新场景

```typescript
// 用户离开页面时，确保所有消息都被处理
onBeforeRouteLeave(() => {
  aggregator.flush();
});

// 网络断开重连时
socket.on('disconnect', () => {
  aggregator.flush();
});
```

## 五、最佳实践

### 5.1 参数调优

| 场景     | interval | maxBatch | 说明               |
| -------- | -------- | -------- | ------------------ |
| 高频弹幕 | 500ms    | 30       | 快速聚合，减少延迟 |
| 普通聊天 | 1000ms   | 50       | 平衡性能与体验     |
| 低频消息 | 2000ms   | 100      | 更大的批次         |

### 5.2 内存管理

```typescript
// 组件卸载时务必销毁
onUnmounted(() => {
  aggregator.destroy(); // 清除定时器、刷新缓冲区
});

// 页面切换时刷新
onDeactivated(() => {
  aggregator.flush(); // 处理剩余消息
});
```

### 5.3 性能监控

```typescript
aggregator.onBatch((batch) => {
  // 监控批次大小，发现异常
  if (batch.count > 40) {
    console.warn('批次过大，考虑调整参数');
  }

  // 处理消息
  processBatch(batch);
});
```

### 5.4 泛型类型安全

```typescript
interface DanmakuMessage {
  id: string;
  content: string;
  userId: string;
  timestamp: number;
}

// 使用泛型确保类型安全
const aggregator = new MessageAggregator<DanmakuMessage>({
  interval: 1000,
});

aggregator.onBatch((batch: MessageBatch<DanmakuMessage>) => {
  // batch.messages 类型为 DanmakuMessage[]
  batch.messages.forEach((msg) => {
    console.log(msg.content); // 类型安全访问
  });
});
```

## 六、扩展场景

### 6.1 多通道聚合

```typescript
// 多个直播间分别聚合
const aggregators = new Map<string, MessageAggregator>();

function getAggregator(roomId: string) {
  if (!aggregators.has(roomId)) {
    const agg = new MessageAggregator({ interval: 1000 });
    agg.onBatch((batch) => handleRoomBatch(roomId, batch));
    aggregators.set(roomId, agg);
  }
  return aggregators.get(roomId)!;
}
```

### 6.2 条件聚合

```typescript
// 根据消息类型选择不同策略
const aggregator = new PriorityMessageAggregator({
  isPriority: (msg) => msg.level === 'vip',

  // VIP 消息立即显示，普通消息聚合
});
```

## 七、API 速查

### MessageAggregator

| 方法               | 参数                | 返回值   | 说明           |
| ------------------ | ------------------- | -------- | -------------- |
| `constructor`      | `AggregatorOptions` | -        | 创建实例       |
| `add`              | `message: T`        | `void`   | 添加单条消息   |
| `addBatch`         | `messages: T[]`     | `void`   | 批量添加       |
| `flush`            | -                   | `void`   | 立即刷新缓冲区 |
| `onBatch`          | `callback`          | `void`   | 订阅批次回调   |
| `getBufferedCount` | -                   | `number` | 获取缓冲数量   |
| `destroy`          | -                   | `void`   | 销毁实例       |

### PriorityMessageAggregator

继承 `MessageAggregator` 所有方法，新增：

| 方法         | 参数       | 返回值 | 说明             |
| ------------ | ---------- | ------ | ---------------- |
| `onPriority` | `callback` | `void` | 订阅高优先级消息 |

## 八、兼容性说明

```typescript
// 兼容旧版本导出
export const LiveMessageAggregator = PriorityMessageAggregator;

// 推荐使用新名称
import { MessageAggregator } from './LiveMessageAggregator';
import { PriorityMessageAggregator } from './LiveMessageAggregator';
```
