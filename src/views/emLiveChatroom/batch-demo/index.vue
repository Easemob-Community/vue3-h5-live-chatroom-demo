<template>
  <div class="batch-danmaku-demo">
    <!-- 顶部导航 -->
    <van-nav-bar title="批量弹幕演示" left-arrow @click-left="goBack">
      <template #right>
        <van-icon name="setting-o" size="20" @click="showConfigPopup" />
      </template>
    </van-nav-bar>

    <!-- 主内容区域：聊天区域 + 右侧统计面板 -->
    <div class="main-content">
      <!-- 弹幕列表区域 -->
      <div ref="danmakuContainer" class="danmaku-list">
        <div v-if="displayList.length === 0" class="empty-tip">
          等待接收弹幕消息...
        </div>
        <div ref="danmakuListInner" class="danmaku-list-inner" :class="{ 'batch-inserting': isBatchInserting }">
          <div v-for="item in displayList" :key="item.id" class="danmaku-item" :class="[
            item.type === 'priority' ? 'priority' : 'normal',
            item.isNew ? 'new-item' : ''
          ]" :data-id="item.id">
            <div v-if="item.type === 'batch-header'" class="batch-header">
              <span class="batch-badge">批次 #{{ item.batchIndex }}</span>
              <span class="batch-info">{{ item.count }}条消息 · {{ item.timestamp }}</span>
            </div>
            <template v-else>
              <span v-if="item.role" :class="['role-badge', item.role]">
                {{ item.role === 'host' ? '主播' : '观众' }}
              </span>
              <span class="nickname">{{ item.nickname }}</span>
              <span class="separator">:</span>
              <span class="content">{{ item.content }}</span>
              <span v-if="item.type === 'priority'" class="priority-tag">⚡即时</span>
            </template>
          </div>
        </div>
      </div>

      <!-- 右侧统计面板（纵向吸附） -->
      <div class="stats-panel-vertical">
        <div class="stat-item-vertical">
          <div class="stat-value">{{ stats.batchCount }}</div>
          <div class="stat-label">批次</div>
        </div>
        <div class="stat-divider-v"></div>
        <div class="stat-item-vertical">
          <div class="stat-value">{{ stats.lastBatchSize }}</div>
          <div class="stat-label">上批</div>
        </div>
        <div class="stat-divider-v"></div>
        <div class="stat-item-vertical">
          <div class="stat-value">{{ stats.avgBatchSize }}</div>
          <div class="stat-label">平均</div>
        </div>
        <div class="stat-divider-v"></div>
        <div class="stat-item-vertical">
          <div class="stat-value">{{ stats.receivedCount }}</div>
          <div class="stat-label">累计</div>
        </div>
        <div class="stat-divider-v"></div>
        <div class="stat-item-vertical">
          <div class="stat-value">{{ bufferedCount }}</div>
          <div class="stat-label">缓冲</div>
        </div>
        <div class="stat-divider-v"></div>
        <div class="stat-item-vertical">
          <div class="stat-value">{{ stats.priorityCount }}</div>
          <div class="stat-label">即时</div>
        </div>
        <div class="stat-divider-v"></div>
        <div class="stat-item-vertical">
          <span class="status-dot-small" :class="imConnected ? 'connected' : 'disconnected'"></span>
          <div class="stat-label">IM</div>
        </div>
        <!-- 聚合策略控制 -->
        <div class="stat-divider-v"></div>
        <div class="strategy-control-vertical">
          <button :class="['strategy-btn-v', currentStrategy === 'high' ? 'active' : '']" title="活跃模式 0.5s"
            @click="setStrategy('high')">
            活
          </button>
          <button :class="['strategy-btn-v', currentStrategy === 'normal' ? 'active' : '']" title="标准模式 1s"
            @click="setStrategy('normal')">
            标
          </button>
          <button :class="['strategy-btn-v', currentStrategy === 'low' ? 'active' : '']" title="冷淡模式 2s"
            @click="setStrategy('low')">
            冷
          </button>
        </div>
      </div>
    </div>

    <!-- 配置弹窗 -->
    <van-popup v-model:show="configPopupVisible" position="bottom" round :style="{ height: '60%' }">
      <div class="config-popup">
        <div class="config-popup-header">
          <span class="config-popup-title">配置</span>
          <van-icon name="cross" size="20" @click="configPopupVisible = false" />
        </div>
        <div class="config-popup-content">
          <van-cell-group title="用户配置">
            <van-field v-model="configForm.userId" label="用户ID" placeholder="请输入用户ID" clearable />
            <van-field v-model="configForm.nickname" label="昵称" placeholder="请输入昵称" clearable />
            <van-field v-model="configForm.password" label="密码" placeholder="请输入密码" clearable type="password" />
            <van-field v-model="configForm.accessToken" label="AccessToken" placeholder="请输入Token" clearable
              type="textarea" rows="2" />
          </van-cell-group>
          <van-cell-group title="聊天室配置">
            <van-field v-model="configForm.interactiveRoomId" label="互动聊天室ID" placeholder="请输入互动聊天室ID" clearable />
            <van-field v-model="configForm.signalingRoomId" label="信令聊天室ID" placeholder="请输入信令聊天室ID" clearable />
          </van-cell-group>
          <div class="config-popup-actions">
            <van-button type="primary" block round @click="saveConfig">保存并重新连接</van-button>
            <van-button type="default" block round style="margin-top: 10px" @click="goToFullConfig">进入完整配置页</van-button>
          </div>
        </div>
      </div>
    </van-popup>

    <!-- 底部控制栏 -->
    <div class="control-bar">
      <div class="control-row">
        <div class="input-area">
          <input v-model="inputMessage" type="text" placeholder="输入测试弹幕" @keyup.enter="sendTestMessage" />
          <button class="send-btn" @click="sendTestMessage">发送</button>
        </div>
      </div>
      <div class="test-controls">
        <button class="test-btn" @click="simulateBatchMessages">模拟批量(20条)</button>
        <button class="test-btn priority" @click="simulatePriorityMessage">模拟礼物</button>
        <button class="test-btn clear" @click="clearMessages">清空</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { PriorityMessageAggregator, MessageBatch } from '../utils/LiveMessageAggregator';
import { EMClient, EasemobChat } from '@/easeim';

const router = useRouter();

// ============================================
// 配置弹窗
// ============================================
const configPopupVisible = ref(false);

const configForm = ref<Config>({
  userId: '',
  nickname: '',
  password: '',
  accessToken: '',
  interactiveRoomId: '',
  signalingRoomId: '',
});

const showConfigPopup = () => {
  configForm.value = { ...config.value };
  configPopupVisible.value = true;
};

const saveConfig = async () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configForm.value));
    config.value = { ...configForm.value };
    configPopupVisible.value = false;
    showToast('配置已保存');

    // 重新连接IM
    await reconnectIM();
  } catch (error) {
    console.error('保存配置失败', error);
    showToast('保存失败');
  }
};

const goToFullConfig = () => {
  router.push('/im/livechatroom');
};

const reconnectIM = async () => {
  try {
    // 关闭现有连接
    EMClient.close();
    EMClient.removeEventHandler('BATCH_DEMO_CONNECTED');
    EMClient.removeEventHandler('BATCH_DEMO_MESSAGE');
    EMClient.removeEventHandler('BATCH_DEMO_SIGNALING');
    imConnected.value = false;

    // 重新初始化
    setupIMListeners();
    await loginIM();
  } catch (error) {
    console.error('重新连接失败', error);
    showToast('重新连接失败');
  }
};

// ============================================
// 配置加载
// ============================================
const STORAGE_KEY = 'live_chatroom_config';

interface Config {
  userId: string;
  nickname: string;
  password: string;
  accessToken: string;
  interactiveRoomId: string;
  signalingRoomId: string;
}

const config = ref<Config>({
  userId: '',
  nickname: '',
  password: '',
  accessToken: '',
  interactiveRoomId: '',
  signalingRoomId: '',
});

const loadConfig = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      config.value = {
        userId: parsed.userId || '',
        nickname: parsed.nickname || '',
        password: parsed.password || '',
        accessToken: parsed.accessToken || '',
        interactiveRoomId: parsed.interactiveRoomId || '',
        signalingRoomId: parsed.signalingRoomId || '',
      };
    }
  } catch (error) {
    console.error('加载配置失败', error);
  }
};

// ============================================
// 状态管理
// ============================================
const imConnected = ref(false);
const currentInterval = ref(1000);
const bufferedCount = ref(0);
const inputMessage = ref('');
const danmakuContainer = ref<HTMLDivElement | null>(null);
const danmakuListInner = ref<HTMLDivElement | null>(null);
const isBatchInserting = ref(false);

// 统计数据
const stats = ref({
  receivedCount: 0,
  batchCount: 0,
  lastBatchSize: 0,
  avgBatchSize: 0,
  priorityCount: 0,
});

// 显示列表
interface DisplayItem {
  id: string;
  type: 'normal' | 'priority' | 'batch-header';
  content?: string;
  nickname?: string;
  role?: string;
  batchIndex?: number;
  count?: number;
  timestamp?: string;
  isNew?: boolean;
  batchAnimating?: boolean;
}

// 聚合器类型
interface AggregatedMessage {
  id: string;
  from: string;
  to: string;
  msg: string;
  type: string;
  ext?: Record<string, any>;
}

// 当前策略
const currentStrategy = ref<'high' | 'normal' | 'low'>('normal');

const displayList = ref<DisplayItem[]>([]);
const MAX_DISPLAY_COUNT = 100;
let batchIndexCounter = 0;

// ============================================
// 聚合器初始化
// ============================================
let aggregator: PriorityMessageAggregator<AggregatedMessage> | null = null;

const initAggregator = () => {
  aggregator = new PriorityMessageAggregator<AggregatedMessage>({
    interval: 1000,
    maxBatch: 50,
    isPriority: (msg) => ['gift', 'like', 'enter', 'enter_room', 'follow'].includes(msg.ext?.msgType || msg.type),
  });

  // 订阅批量消息
  aggregator.onBatch((batch: MessageBatch<AggregatedMessage>) => {
    handleBatchMessage(batch);
  });

  // 订阅高优先级消息（单条）
  aggregator.onPriority((msg: AggregatedMessage) => {
    handlePriorityMessage(msg);
  });
};

// ============================================
// 消息处理
// ============================================
const handleBatchMessage = (batch: MessageBatch<AggregatedMessage>) => {
  stats.value.receivedCount += batch.count;
  stats.value.batchCount++;
  stats.value.lastBatchSize = batch.count;
  stats.value.avgBatchSize = Math.round(stats.value.receivedCount / stats.value.batchCount);

  batchIndexCounter++;
  const timestamp = new Date().toLocaleTimeString();
  const batchId = Date.now();

  // 记录当前滚动位置
  const container = danmakuContainer.value;
  const wasAtBottom = container
    ? container.scrollHeight - container.scrollTop <= container.clientHeight + 50
    : true;

  // 标记正在批量插入
  isBatchInserting.value = true;

  // 添加批次头部
  const headerItem: DisplayItem = {
    id: `batch-${batchId}`,
    type: 'batch-header',
    batchIndex: batchIndexCounter,
    count: batch.count,
    timestamp: timestamp,
    isNew: true,
  };

  displayList.value.push(headerItem);

  // 添加消息内容
  batch.messages.forEach((msg) => {
    const item: DisplayItem = {
      id: msg.id,
      type: 'normal',
      content: msg.msg,
      nickname: msg.ext?.nickname || msg.from,
      role: msg.ext?.role || 'audience',
      isNew: true,
    };
    displayList.value.push(item);
  });

  // 限制显示数量
  while (displayList.value.length > MAX_DISPLAY_COUNT) {
    displayList.value.shift();
  }

  // 下一帧执行动画和滚动
  nextTick(() => {
    animateNewItems();
    scrollToBottomIfAtBottom(container, wasAtBottom);

    // 清除标记
    setTimeout(() => {
      isBatchInserting.value = false;
      displayList.value.forEach((item) => {
        item.isNew = false;
      });
    }, 400);
  });
};

/** 新消息滑入动画 */
const animateNewItems = () => {
  const newItems = danmakuListInner.value?.querySelectorAll('.danmaku-item.new-item');
  newItems?.forEach((item, index) => {
    const el = item as HTMLElement;
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'none';

    // 错开动画时间
    setTimeout(() => {
      el.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      el.style.opacity = '1';
      el.style.transform = '';
    }, index * 20);
  });
};

/** 如果在底部则滚动到底部 */
const scrollToBottomIfAtBottom = (container: HTMLDivElement | null, wasAtBottom: boolean) => {
  if (wasAtBottom && container) {
    nextTick(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
      });
    });
  }
};

const handlePriorityMessage = (msg: AggregatedMessage) => {
  stats.value.priorityCount++;

  const container = danmakuContainer.value;
  const wasAtBottom = container
    ? container.scrollHeight - container.scrollTop <= container.clientHeight + 50
    : true;

  const item: DisplayItem = {
    id: msg.id,
    type: 'priority',
    content: msg.msg,
    nickname: msg.ext?.nickname || msg.from,
    role: msg.ext?.role || 'audience',
    isNew: true,
  };

  displayList.value.push(item);

  // 限制显示数量
  while (displayList.value.length > MAX_DISPLAY_COUNT) {
    displayList.value.shift();
  }

  // 自动滚动到底部
  nextTick(() => {
    scrollToBottomIfAtBottom(container, wasAtBottom);
    animateNewItems();

    setTimeout(() => {
      item.isNew = false;
    }, 300);
  });
};

// ============================================
// IM 连接和聊天室管理
// ============================================

/** 注册 IM 连接状态监听 */
const setupIMListeners = () => {
  // 连接状态监听
  EMClient.addEventHandler('BATCH_DEMO_CONNECTED', {
    onConnected: () => {
      console.log('[BatchDemo] IM 已连接');
      imConnected.value = true;
      joinLiveChatroom();
      joinLiveSignalingChatroom();
    },
    onDisconnected: () => {
      console.log('[BatchDemo] IM 已断开');
      imConnected.value = false;
    },
  });

  // 互动直播间消息监听
  EMClient.addEventHandler('BATCH_DEMO_MESSAGE', {
    onTextMessage: (message: EasemobChat.TextMsgBody) => {
      console.log('[BatchDemo] 收到文本消息:', message);
      if (message.to === config.value.interactiveRoomId && aggregator) {
        aggregator.add({
          id: message.id || `msg-${Date.now()}`,
          from: message.from || '',
          to: message.to || '',
          msg: message.msg || '',
          type: message.type,
          ext: message.ext,
        });
      }
    },
  });

  // 信令直播间监听
  EMClient.addEventHandler('BATCH_DEMO_SIGNALING', {
    onCustomMessage(msg: EasemobChat.CustomMsgBody) {
      console.log('[BatchDemo] 收到自定义消息:', msg);
      if (msg.to === config.value.signalingRoomId && aggregator) {
        aggregator.add({
          id: msg.id || `custom-${Date.now()}`,
          from: msg.from || '',
          to: msg.to || '',
          msg: msg.customEvent || '',
          type: 'custom',
          ext: msg.ext,
        });
      }
    },
    onCmdMessage(msg: EasemobChat.CmdMsgBody) {
      console.log('[BatchDemo] 收到命令消息:', msg);
      if (msg.to === config.value.signalingRoomId && aggregator) {
        aggregator.add({
          id: msg.id || `cmd-${Date.now()}`,
          from: msg.from || '',
          to: msg.to || '',
          msg: msg.action || '',
          type: 'cmd',
          ext: msg.ext,
        });
      }
    },
  });
};

/** 加入互动直播间 */
const joinLiveChatroom = async () => {
  if (!config.value.interactiveRoomId) {
    showToast('未配置互动聊天室ID');
    return;
  }
  try {
    await EMClient.joinChatRoom({ roomId: config.value.interactiveRoomId, message: '加入互动直播间' });
    console.log('[BatchDemo] 加入互动直播间成功');
  } catch (error) {
    console.error('[BatchDemo] 加入互动直播间失败:', error);
  }
};

/** 加入信令直播间 */
const joinLiveSignalingChatroom = async () => {
  if (!config.value.signalingRoomId) {
    console.log('[BatchDemo] 未配置信令聊天室ID，跳过加入');
    return;
  }
  try {
    await EMClient.joinChatRoom({ roomId: config.value.signalingRoomId, message: '加入信令聊天室' });
    console.log('[BatchDemo] 加入信令聊天室成功');
  } catch (error) {
    console.error('[BatchDemo] 加入信令聊天室失败:', error);
  }
};

const loginIM = async () => {
  if (!config.value.userId) {
    showToast('请先配置用户ID');
    return;
  }
  if (!config.value.password && !config.value.accessToken) {
    showToast('请先配置密码或Token');
    return;
  }

  const loginParams: { user: string; pwd?: string; accessToken?: string } = {
    user: config.value.userId,
  };

  if (config.value.password) {
    loginParams.pwd = config.value.password;
  } else {
    loginParams.accessToken = config.value.accessToken;
  }

  try {
    await EMClient.open(loginParams);
    console.log('[BatchDemo] IM 登录成功');
  } catch (error) {
    console.error('[BatchDemo] IM 登录失败:', error);
    showToast('IM 登录失败');
  }
};

// ============================================
// 测试功能
// ============================================
const sendTestMessage = () => {
  if (!inputMessage.value.trim()) return;

  if (aggregator) {
    aggregator.add({
      id: `test-${Date.now()}`,
      from: config.value.userId || 'test-user',
      to: config.value.interactiveRoomId || 'test-room',
      msg: inputMessage.value,
      type: 'txt',
      ext: {
        nickname: config.value.nickname || '测试用户',
        role: 'host',
      },
    });
  }

  inputMessage.value = '';
};

const simulateBatchMessages = () => {
  const messages: AggregatedMessage[] = [];
  for (let i = 0; i < 20; i++) {
    messages.push({
      id: `sim-${Date.now()}-${i}`,
      from: `user-${Math.floor(Math.random() * 1000)}`,
      to: config.value.interactiveRoomId || 'test-room',
      msg: `这是模拟的弹幕消息内容 #${i + 1}`,
      type: 'txt',
      ext: {
        nickname: `用户${Math.floor(Math.random() * 100)}`,
        role: Math.random() > 0.8 ? 'host' : 'audience',
      },
    });
  }

  if (aggregator) {
    aggregator.addBatch(messages);
  }

  showToast('已模拟20条消息');
};

const simulatePriorityMessage = () => {
  const gifts = ['🎁 送出了火箭', '❤️ 点赞 x99', '🎉 进入了直播间', '⭐ 关注了主播'];
  const randomGift = gifts[Math.floor(Math.random() * gifts.length)];

  if (aggregator) {
    aggregator.add({
      id: `priority-${Date.now()}`,
      from: `vip-user-${Math.floor(Math.random() * 100)}`,
      to: config.value.interactiveRoomId || 'test-room',
      msg: randomGift,
      type: 'custom',
      ext: {
        msgType: 'gift',
        nickname: `VIP用户${Math.floor(Math.random() * 10)}`,
        role: 'audience',
      },
    });
  }
};

const clearMessages = () => {
  displayList.value = [];
  stats.value = {
    receivedCount: 0,
    batchCount: 0,
    lastBatchSize: 0,
    avgBatchSize: 0,
    priorityCount: 0,
  };
  batchIndexCounter = 0;
};

// ============================================
// 策略控制
// ============================================
const setStrategy = (strategy: 'high' | 'normal' | 'low') => {
  const intervals = { high: 500, normal: 1000, low: 2000 };
  currentInterval.value = intervals[strategy];
  showToast(`已切换为${strategy === 'high' ? '活跃' : strategy === 'normal' ? '标准' : '冷淡'}模式(${currentInterval.value}ms)`);
};

// ============================================
// 状态更新
// ============================================
let statsTimer: NodeJS.Timeout | null = null;

const startStatsUpdate = () => {
  statsTimer = setInterval(() => {
    if (aggregator) {
      bufferedCount.value = aggregator.getBufferedCount();
    }
  }, 100);
};

// ============================================
// 导航
// ============================================
const goBack = () => {
  router.back();
};

// ============================================
// 生命周期
// ============================================
onMounted(() => {
  loadConfig();
  initAggregator();
  setupIMListeners();
  loginIM();
  startStatsUpdate();
});

onUnmounted(() => {
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
  if (aggregator) {
    aggregator.destroy();
    aggregator = null;
  }
  EMClient.removeEventHandler('BATCH_DEMO_CONNECTED');
  EMClient.removeEventHandler('BATCH_DEMO_MESSAGE');
  EMClient.removeEventHandler('BATCH_DEMO_SIGNALING');
  EMClient.close();
});
</script>

<style scoped>
.batch-danmaku-demo {
  height: 100vh;
  background-color: #f5f5f5;
  display: flex;
  flex-direction: column;
}

/* 主内容区域：聊天区 + 右侧统计面板 */
.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* 弹幕列表 - 正常布局，从上到下 */
.danmaku-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  padding-right: 70px;
  background-color: #1a1a2e;
}

.danmaku-list-inner {
  display: flex;
  flex-direction: column;
}

.empty-tip {
  text-align: center;
  color: #666;
  padding: 40px;
  font-size: 14px;
}

.danmaku-item {
  padding: 8px 12px;
  margin-bottom: 4px;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.5;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.danmaku-item.normal {
  background-color: rgba(255, 255, 255, 0.05);
}

.danmaku-item.priority {
  background-color: rgba(255, 107, 107, 0.15);
  border-left: 3px solid #ff6b6b;
}

.danmaku-item.new-item {
  opacity: 0;
}

/* 批次插入时的整体效果 */
.danmaku-list-inner.batch-inserting {
  will-change: transform;
}

.batch-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
  margin-bottom: 4px;
}

.batch-badge {
  background-color: #07c160;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.batch-info {
  color: #999;
  font-size: 12px;
}

.role-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.role-badge.host {
  background-color: #ff6b6b;
  color: white;
}

.role-badge.audience {
  background-color: #4dabf7;
  color: white;
}

.nickname {
  color: #ffd700;
  font-weight: 500;
}

.separator {
  color: rgba(255, 255, 255, 0.6);
}

.content {
  color: white;
  word-break: break-word;
}

.priority-tag {
  margin-left: auto;
  background-color: #ff6b6b;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

/* 右侧统计面板 - 纵向吸附 */
.stats-panel-vertical {
  position: absolute;
  right: 8px;
  top: 12px;
  bottom: 12px;
  width: 50px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  z-index: 10;
}

.stat-item-vertical {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
}

.stat-item-vertical .stat-value {
  font-size: 14px;
  font-weight: bold;
  color: #fff;
  line-height: 1.2;
}

.stat-item-vertical .stat-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 2px;
}

.stat-divider-v {
  width: 24px;
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  margin: 4px 0;
}

.status-dot-small {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot-small.connected {
  background-color: #07c160;
}

.status-dot-small.disconnected {
  background-color: #ff4d4f;
}

/* 底部控制栏 */
.control-bar {
  background-color: white;
  border-top: 1px solid #eee;
  padding: 12px;
}

.control-row {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
}

.input-area {
  display: flex;
  gap: 8px;
  flex: 1;
}

.input-area input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
}

.input-area input:focus {
  border-color: #07c160;
}

.send-btn {
  padding: 10px 20px;
  background-color: #07c160;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

/* 策略控制 - 纵向布局 */
.strategy-control-vertical {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 4px 0;
}

.strategy-btn-v {
  width: 100%;
  padding: 6px 4px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background-color: transparent;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.strategy-btn-v.active {
  background-color: #07c160;
  color: white;
  border-color: #07c160;
}

.strategy-btn-v:hover {
  background-color: rgba(7, 193, 96, 0.3);
}

.test-controls {
  display: flex;
  gap: 8px;
}

.test-btn {
  flex: 1;
  padding: 8px;
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.test-btn:hover {
  background-color: #e0e0e0;
}

.test-btn.priority {
  background-color: #fff2f0;
  border-color: #ffccc7;
  color: #ff4d4f;
}

.test-btn.clear {
  background-color: #f5f5f5;
  color: #999;
}

/* 配置弹窗 */
.config-popup {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.config-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.config-popup-title {
  font-size: 16px;
  font-weight: 500;
}

.config-popup-content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 20px;
}

.config-popup-actions {
  padding: 20px 16px;
}
</style>
