/**
 * 聚合器配置选项
 */
export interface AggregatorOptions {
  /** 聚合周期（毫秒），默认1000ms */
  interval?: number;
  /** 单批上限，默认50 */
  maxBatch?: number;
}

/**
 * 消息批次
 */
export interface MessageBatch<T = any> {
  /** 批次中的消息 */
  messages: T[];
  /** 消息数量 */
  count: number;
  /** 批次时间戳 */
  timestamp: number;
}

/**
 * 消息聚合器 - 纯聚合逻辑，无业务耦合
 *
 * 使用方式：
 * const aggregator = new MessageAggregator({ interval: 1000 });
 * aggregator.onBatch((batch) => console.log('收到批次:', batch));
 * aggregator.add(message);
 */
export class MessageAggregator<T = any> {
  private interval: number;
  private maxBatch: number;
  private buffer: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  private onBatchCallback?: (batch: MessageBatch<T>) => void;

  public constructor(options: AggregatorOptions = {}) {
    this.interval = options.interval || 1000;
    this.maxBatch = options.maxBatch || 50;
  }

  /**
   * 添加单条消息到聚合缓冲区
   */
  public add(message: T): void {
    this.buffer.push(message);

    // 达到上限立即刷新
    if (this.buffer.length >= this.maxBatch) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.interval);
    }
  }

  /**
   * 批量添加消息
   */
  public addBatch(messages: T[]): void {
    messages.forEach((msg) => this.add(msg));
  }

  /**
   * 立即刷新缓冲区
   */
  public flush(): void {
    if (this.buffer.length === 0) return;

    const batch: MessageBatch<T> = {
      messages: [...this.buffer],
      count: this.buffer.length,
      timestamp: Date.now(),
    };

    this.buffer = [];

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.onBatchCallback?.(batch);
  }

  /**
   * 订阅批次回调
   */
  public onBatch(callback: (batch: MessageBatch<T>) => void): void {
    this.onBatchCallback = callback;
  }

  /**
   * 获取当前缓冲数量
   */
  public getBufferedCount(): number {
    return this.buffer.length;
  }

  /**
   * 销毁
   */
  public destroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flush();
    this.onBatchCallback = undefined;
  }
}

/**
 * 带优先级通道的消息聚合器
 *
 * 高优先级消息立即通过，普通消息按时间聚合
 */
export interface PriorityAggregatorOptions extends AggregatorOptions {
  /** 高优先级判断函数 */
  isPriority?: (message: any) => boolean;
}

export class PriorityMessageAggregator<T = any> {
  private normalAggregator: MessageAggregator<T>;
  private isPriorityFn?: (message: T) => boolean;
  private onPriorityCallback?: (message: T) => void;

  public constructor(options: PriorityAggregatorOptions = {}) {
    this.normalAggregator = new MessageAggregator<T>(options);
    this.isPriorityFn = options.isPriority;
  }

  /**
   * 添加消息
   */
  public add(message: T): void {
    // 高优先级立即发送
    if (this.isPriorityFn?.(message)) {
      this.onPriorityCallback?.(message);
      return;
    }

    // 普通消息进入聚合
    this.normalAggregator.add(message);
  }

  /**
   * 批量添加
   */
  public addBatch(messages: T[]): void {
    messages.forEach((msg) => this.add(msg));
  }

  /**
   * 订阅普通批次
   */
  public onBatch(callback: (batch: MessageBatch<T>) => void): void {
    this.normalAggregator.onBatch(callback);
  }

  /**
   * 订阅高优先级消息
   */
  public onPriority(callback: (message: T) => void): void {
    this.onPriorityCallback = callback;
  }

  /**
   * 立即刷新
   */
  public flush(): void {
    this.normalAggregator.flush();
  }

  /**
   * 获取缓冲数量
   */
  public getBufferedCount(): number {
    return this.normalAggregator.getBufferedCount();
  }

  /**
   * 销毁
   */
  public destroy(): void {
    this.normalAggregator.destroy();
    this.onPriorityCallback = undefined;
  }
}

// 兼容旧版本导出
export const LiveMessageAggregator = PriorityMessageAggregator;
export default MessageAggregator;
