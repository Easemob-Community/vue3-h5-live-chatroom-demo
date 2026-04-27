<template>
  <div v-show="visible" class="like-animation-container">
    <!-- 飘浮动画层 -->
    <div ref="floatingLayerRef" class="floating-layer"></div>

    <!-- 点赞按钮区域 -->
    <div class="like-button-area" :class="{ pressing: isPressing }">
      <div
        class="like-button"
        @click="handleLikeClick"
        @touchstart="isPressing = true"
        @touchend="isPressing = false"
      >
        <div class="like-icon-wrapper" :class="{ bump: bumpTrigger }">
          <span class="like-icon">{{ currentEmoji }}</span>
        </div>
        <span v-if="displayCount > 0" class="like-count" :title="String(displayCount)">
          {{ formatCount(displayCount) }}
        </span>
      </div>
      <!-- 连击提示 -->
      <div v-if="comboCount >= 3" class="combo-hint" :class="{ 'big-combo': comboCount >= 10 }">
        x{{ formatCombo(comboCount) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

// ============================================
// Props & Emits
// ============================================
export interface LikeAnimationProps {
  /** 是否显示组件 */
  visible?: boolean;
  /** 上报接口函数，接收聚合后的点赞数量 */
  reportApi?: (count: number) => Promise<void> | void;
  /** 点击聚合间隔（毫秒），默认 500ms */
  aggregateInterval?: number;
  /** 自定义 emoji 列表 */
  emojis?: string[];
  /** 单批次最大飘浮数量 */
  maxFloatCount?: number;
  /** 全局同时存在的最大飘浮 emoji 数量（性能保护） */
  maxGlobalFloatCount?: number;
  /** 是否禁用点击上报（纯展示模式） */
  disabledClickReport?: boolean;
}

const props = withDefaults(defineProps<LikeAnimationProps>(), {
  visible: true,
  aggregateInterval: 500,
  emojis: () => ['❤️', '👍', '🎉', '🔥', '⭐', '🚀', '💖', '🌟', '👏', '💯'],
  maxFloatCount: 50,
  maxGlobalFloatCount: 80,
  disabledClickReport: false,
});

const emit = defineEmits<{
  (e: 'like-click', count: number): void;
  (e: 'report-success', count: number): void;
  (e: 'report-fail', error: unknown, count: number): void;
}>();

// ============================================
// 状态定义
// ============================================
const floatingLayerRef = ref<HTMLDivElement | null>(null);
const displayCount = ref(0);
const comboCount = ref(0);
const isPressing = ref(false);
const bumpTrigger = ref(false);

// 性能与降级
const isLowEndDevice = ref(false);
const isPageVisible = ref(true);

// 全局 DOM 计数器（跨批次共享，防止内存/性能爆炸）
let globalFloatingCount = 0;

// 点击聚合
let pendingClickCount = 0;
let aggregateTimer: NodeJS.Timeout | null = null;
let comboTimer: NodeJS.Timeout | null = null;
let lastEmojiIndex = -1;

// ============================================
// 计算属性
// ============================================
const currentEmoji = computed(() => {
  if (comboCount.value >= 10) return '🔥';
  if (comboCount.value >= 5) return '💖';
  return '❤️';
});

// ============================================
// 性能检测：低端设备降级
// ============================================
const detectDevicePerformance = () => {
  // 内存 <= 4GB 或 CPU 核心 <= 4 视为低端设备
  const memory = (navigator as any).deviceMemory;
  const cores = navigator.hardwareConcurrency || 4;

  if ((memory && memory <= 4) || cores <= 4) {
    isLowEndDevice.value = true;
    console.log('[LikeAnimation] 低端设备检测通过，启用降级策略');
  }
};

// ============================================
// 页面可见性：后台暂停动画
// ============================================
const handleVisibilityChange = () => {
  isPageVisible.value = document.visibilityState === 'visible';
  if (!isPageVisible.value) {
    // 切后台时立即 flush 待上报数据
    flushPendingClicks();
  }
};

// ============================================
// 核心方法：触发点赞动画
// ============================================

/**
 * 触发点赞飘浮动画
 * @param count 点赞数量（服务端聚合后的数量）
 */
const triggerLike = (count: number = 1) => {
  if (!props.visible || !isPageVisible.value) return;

  // 低端设备：只更新数字，不渲染飘浮动画（保证流畅）
  displayCount.value += count;
  if (isLowEndDevice.value) return;

  // 计算本批次应生成的数量
  let floatCount: number;
  if (count <= 10) {
    floatCount = count;
  } else {
    // 对数增长，避免大数值线性爆炸
    floatCount = Math.min(Math.floor(Math.log10(count) * 10) + 8, props.maxFloatCount);
  }

  // 全局 DOM 上限保护：若当前已有很多 emoji 在飘，减少新创建数量
  const availableSlots = Math.max(0, props.maxGlobalFloatCount - globalFloatingCount);
  floatCount = Math.min(floatCount, availableSlots);
  if (floatCount <= 0) return;

  // 大数值时密度更高（错峰延迟更短）
  const densityFactor = count > 500 ? 0.1 : count > 100 ? 0.18 : count > 20 ? 0.28 : 0.4;

  for (let i = 0; i < floatCount; i++) {
    createFloatingEmoji(i, floatCount, densityFactor);
  }
};

/**
 * 创建单个飘浮 emoji 元素
 */
const createFloatingEmoji = (index: number, total: number, densityFactor: number) => {
  const layer = floatingLayerRef.value;
  if (!layer) return;

  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = getRandomEmoji();

  // 集中在按钮上方区域（右侧 5% ~ 55%）
  const startX = 5 + Math.random() * 50;
  const duration = 2 + Math.random() * 1.5;
  const size = 22 + Math.random() * 20;
  const delay = (index / Math.max(total, 1)) * densityFactor + Math.random() * 0.12;
  const swayDir = Math.random() > 0.5 ? 1 : -1;
  const swayAmp = 25 + Math.random() * 50;

  el.style.cssText = `
    position: absolute;
    bottom: 0;
    left: ${startX}%;
    font-size: ${size}px;
    pointer-events: none;
    opacity: 0;
    transform: translateY(0) scale(0.5);
    animation: float-up ${duration}s ease-out ${delay}s forwards;
    --sway-dir: ${swayDir};
    --sway-amp: ${swayAmp}px;
    z-index: 50;
    will-change: transform, opacity;
  `;

  layer.appendChild(el);
  globalFloatingCount++;

  const totalDuration = (duration + delay) * 1000;
  setTimeout(() => {
    if (el.parentNode === layer) {
      layer.removeChild(el);
      globalFloatingCount = Math.max(0, globalFloatingCount - 1);
    }
  }, totalDuration + 100);
};

/**
 * 获取随机 emoji（避免连续重复）
 */
const getRandomEmoji = (): string => {
  const list = props.emojis;
  if (list.length <= 1) return list[0] || '❤️';
  let idx = Math.floor(Math.random() * list.length);
  while (idx === lastEmojiIndex && list.length > 1) {
    idx = Math.floor(Math.random() * list.length);
  }
  lastEmojiIndex = idx;
  return list[idx];
};

// ============================================
// 点击聚合上报逻辑
// ============================================

const handleLikeClick = () => {
  triggerLike(1);
  comboCount.value++;

  bumpTrigger.value = true;
  setTimeout(() => (bumpTrigger.value = false), 200);

  pendingClickCount++;

  if (comboTimer) clearTimeout(comboTimer);
  comboTimer = setTimeout(() => {
    comboCount.value = 0;
  }, 1500);

  if (aggregateTimer) clearTimeout(aggregateTimer);
  aggregateTimer = setTimeout(() => {
    flushPendingClicks();
  }, props.aggregateInterval);

  emit('like-click', pendingClickCount);
};

/**
 * 刷新待上报的点击数量
 */
const flushPendingClicks = async () => {
  if (pendingClickCount <= 0) return;

  const countToReport = pendingClickCount;
  pendingClickCount = 0;

  if (!props.disabledClickReport && props.reportApi) {
    try {
      await props.reportApi(countToReport);
      emit('report-success', countToReport);
    } catch (error) {
      emit('report-fail', error, countToReport);
      console.error('[LikeAnimation] 点赞上报失败:', error);
    }
  }

  if (aggregateTimer) {
    clearTimeout(aggregateTimer);
    aggregateTimer = null;
  }
};

// ============================================
// 工具方法
// ============================================

const formatCount = (num: number): string => {
  if (num >= 100000000) {
    const v = num / 100000000;
    return v >= 100 ? Math.floor(v) + '亿' : v.toFixed(1).replace(/\.0$/, '') + '亿';
  }
  if (num >= 10000) {
    const v = num / 10000;
    return v >= 100 ? Math.floor(v) + 'w' : v.toFixed(1).replace(/\.0$/, '') + 'w';
  }
  if (num >= 1000) {
    const v = num / 1000;
    return v.toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(num);
};

const formatCombo = (num: number): string => {
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(num);
};

// ============================================
// 生命周期
// ============================================
onMounted(() => {
  detectDevicePerformance();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  flushPendingClicks();
  document.removeEventListener('visibilitychange', handleVisibilityChange);

  if (aggregateTimer) {
    clearTimeout(aggregateTimer);
    aggregateTimer = null;
  }
  if (comboTimer) {
    clearTimeout(comboTimer);
    comboTimer = null;
  }
});

// ============================================
// 暴露方法
// ============================================
defineExpose({
  triggerLike,
  flushPendingClicks,
});
</script>

<style scoped>
.like-animation-container {
  position: absolute;
  bottom: 70px;
  right: 12px;
  width: 140px;
  height: 60vh;
  pointer-events: none;
  z-index: 25;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: flex-end;
}

/* 飘浮层 */
.floating-layer {
  position: absolute;
  bottom: 70px;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

/* 点赞按钮区域 */
.like-button-area {
  position: absolute;
  bottom: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: auto;
  transition: transform 0.1s ease;
}

.like-button-area.pressing {
  transform: scale(0.92);
}

.like-button {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.3);
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: box-shadow 0.2s ease;
}

.like-button:active {
  box-shadow: 0 2px 8px rgba(255, 107, 107, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.2);
}

.like-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.like-icon-wrapper.bump {
  transform: scale(1.3);
}

.like-icon {
  font-size: 24px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

/* 点赞计数 — 防溢出 */
.like-count {
  display: block;
  max-width: 52px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.95);
  font-weight: 600;
  margin-top: 1px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  line-height: 1.2;
  padding: 0 2px;
}

/* 连击提示 */
.combo-hint {
  max-width: 80px;
  font-size: 13px;
  font-weight: bold;
  color: #ff6b6b;
  background: rgba(255, 255, 255, 0.95);
  padding: 2px 8px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  animation: combo-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
}

.combo-hint.big-combo {
  font-size: 12px;
  color: #fff;
  background: linear-gradient(135deg, #ff6b6b, #ff8e53);
}

@keyframes combo-pop {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.5);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>

<style>
/* 全局动画：飘浮上升 + 左右摇摆 + 淡出 */
@keyframes float-up {
  0% {
    opacity: 1;
    transform: translateY(0) translateX(0) scale(0.6) rotate(0deg);
  }
  15% {
    opacity: 1;
    transform: translateY(-60px) translateX(calc(var(--sway-dir) * var(--sway-amp) * 0.3)) scale(1.15)
      rotate(calc(var(--sway-dir) * 12deg));
  }
  40% {
    opacity: 0.9;
    transform: translateY(-150px) translateX(calc(var(--sway-dir) * var(--sway-amp) * -0.25)) scale(1.05)
      rotate(calc(var(--sway-dir) * -6deg));
  }
  70% {
    opacity: 0.5;
    transform: translateY(-280px) translateX(calc(var(--sway-dir) * var(--sway-amp) * 0.45)) scale(0.85)
      rotate(calc(var(--sway-dir) * 10deg));
  }
  100% {
    opacity: 0;
    transform: translateY(-420px) translateX(calc(var(--sway-dir) * var(--sway-amp) * -0.1)) scale(0.5)
      rotate(0deg);
  }
}
</style>
