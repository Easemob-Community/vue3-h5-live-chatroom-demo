import { ref, reactive, onUnmounted, type Ref } from 'vue'
import AgoraRTC, {
  type IAgoraRTCClient,
  type ICameraVideoTrack,
  type IMicrophoneAudioTrack,
  type IAgoraRTCRemoteUser
} from 'agora-rtc-sdk-ng'
import type { UseRTCOptions, UseRTCReturn, RtcState, RtcUser } from './types'

/**
 * useRTC - RTC直播场景的核心Hook封装
 * 
 * 这个Hook提供了完整的RTC直播流程，包括：
 * 1. 初始化RTC客户端
 * 2. 挂载事件监听器
 * 3. 获取RTC访问Token
 * 4. 加入RTC频道
 * 5. 发布音视频流（主播）
 * 6. 订阅远程流（观众）
 * 
 * @param options - Hook配置选项
 * @returns Hook返回的状态和方法
 * 
 * @example
 * ```typescript
 * // 主播使用示例
 * const { 
 *   initRTC, 
 *   setupEventListeners, 
 *   joinChannel, 
 *   publishTracks, 
 *   playLocalVideo 
 * } = useRTC({
 *   channelName: 'live-room-001',
 *   role: 'host',
 *   chatClient: EMClient
 * })
 * 
 * // 完整流程
 * await initRTC()
 * setupEventListeners()
 * await joinChannel()
 * await publishTracks()
 * playLocalVideo(videoElement)
 * ```
 */
export function useRTC(options: UseRTCOptions): UseRTCReturn {
  const { channelName, role, chatClient } = options

  // ==================== 状态管理（响应式） ====================
  
  /**
   * RTC状态管理
   * - joined: 是否已加入频道
   * - channelId: 当前频道ID
   * - localUid: 本地用户UID
   * - joining: 是否正在加入频道
   * - error: 错误信息
   */
  const state = reactive<RtcState>({
    joined: false,
    channelId: null,
    localUid: null,
    remoteUsers: [],
    joining: false,
    error: null
  })

  /**
   * Agora RTC 客户端实例
   */
  let client: IAgoraRTCClient | null = null

  /**
   * 本地视频轨道（主播使用）
   */
  const localVideoTrack = ref<ICameraVideoTrack | null>(null) as Ref<ICameraVideoTrack | null>

  /**
   * 本地音频轨道（主播使用）
   */
  const localAudioTrack = ref<IMicrophoneAudioTrack | null>(null) as Ref<IMicrophoneAudioTrack | null>

  /**
   * 远程用户列表
   */
  const remoteUsers = ref<RtcUser[]>([])

  /**
   * RTC Token信息
   */
  let agoraAppId: string | null = null
  let agoraUid: string | null = null
  let agoraToken: string | null = null

  // ==================== 步骤1：初始化RTC客户端 ====================

  /**
   * 初始化RTC客户端
   * 
   * 功能：
   * - 创建Agora RTC客户端实例
   * - 设置客户端角色（主播/观众）
   * - 如果是主播，创建本地音视频轨道
   * 
   * @throws {Error} 初始化失败时抛出错误
   */
  const initRTC = async (): Promise<void> => {
    try {
      console.log('[useRTC] 开始初始化RTC客户端，角色:', role)

      // 创建Agora客户端实例（直播模式，H.264编码）
      client = AgoraRTC.createClient({ mode: 'live', codec: 'h264' })
      
      // 设置客户端角色
      await client.setClientRole(role)
      console.log('[useRTC] Agora客户端创建成功，角色:', role)

      // 如果是主播角色，创建本地音视频轨道
      if (role === 'host') {
        await createLocalTracks()
      }

      console.log('[useRTC] RTC客户端初始化完成')
    } catch (error) {
      const errorMsg = `初始化RTC客户端失败: ${(error as Error).message}`
      console.error('[useRTC]', errorMsg, error)
      state.error = errorMsg
      throw error
    }
  }

  /**
   * 创建本地音视频轨道（主播专用）
   * 
   * 功能：
   * - 创建麦克风音频轨道
   * - 创建摄像头视频轨道（480p分辨率）
   * 
   * @throws {Error} 创建轨道失败时抛出错误
   */
  const createLocalTracks = async (): Promise<void> => {
    try {
      console.log('[useRTC] 开始创建本地音视频轨道')

      // 创建麦克风音频轨道
      localAudioTrack.value = await AgoraRTC.createMicrophoneAudioTrack()
      console.log('[useRTC] 麦克风音频轨道创建成功')

      // 创建摄像头视频轨道
      localVideoTrack.value = await AgoraRTC.createCameraVideoTrack({
        encoderConfig: '480p_1', // 480p分辨率，适合移动端直播
      })
      console.log('[useRTC] 摄像头视频轨道创建成功')
    } catch (error) {
      const errorMsg = `创建本地音视频轨道失败: ${(error as Error).message}`
      console.error('[useRTC]', errorMsg, error)
      state.error = errorMsg
      throw error
    }
  }

  // ==================== 步骤2：挂载事件监听器 ====================

  /**
   * 挂载RTC事件监听器
   * 
   * 监听事件：
   * - user-published: 远程用户发布音视频流
   * - user-unpublished: 远程用户取消发布音视频流
   * - user-left: 远程用户离开频道
   * 
   * 说明：
   * 这些事件监听器用于处理远程用户的音视频流变化，
   * 自动订阅新发布的流，并更新UI状态
   */
  const setupEventListeners = (): void => {
    if (!client) {
      console.warn('[useRTC] 客户端未初始化，无法挂载事件监听器')
      return
    }

    console.log('[useRTC] 开始挂载事件监听器')

    // 监听远程用户发布流
    client.on('user-published', handleUserPublished)
    
    // 监听远程用户取消发布流
    client.on('user-unpublished', handleUserUnpublished)
    
    // 监听远程用户离开频道
    client.on('user-left', handleUserLeft)

    console.log('[useRTC] 事件监听器挂载完成')
  }

  /**
   * 处理远程用户发布流事件
   * 
   * @param user - 远程用户对象
   * @param mediaType - 媒体类型（audio/video）
   */
  const handleUserPublished = async (
    user: IAgoraRTCRemoteUser,
    mediaType: 'audio' | 'video'
  ): Promise<void> => {
    try {
      console.log(`[useRTC] 用户 ${user.uid} 发布了 ${mediaType} 流`)

      // 订阅远程用户的媒体流
      await client?.subscribe(user, mediaType)
      console.log(`[useRTC] 成功订阅用户 ${user.uid} 的 ${mediaType} 流`)

      // 更新或添加远程用户信息
      const existingUser = remoteUsers.value.find(u => u.uid === user.uid.toString())
      if (existingUser) {
        // 更新已存在的用户
        if (mediaType === 'audio') {
          existingUser.hasAudio = true
          existingUser.audioTrack = user.audioTrack
        }
        if (mediaType === 'video') {
          existingUser.hasVideo = true
          existingUser.videoTrack = user.videoTrack
        }
      } else {
        // 添加新用户
        remoteUsers.value.push({
          uid: user.uid.toString(),
          hasAudio: mediaType === 'audio',
          hasVideo: mediaType === 'video',
          audioTrack: mediaType === 'audio' ? user.audioTrack : undefined,
          videoTrack: mediaType === 'video' ? user.videoTrack : undefined
        })
      }

      // 如果是音频流，自动播放
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.play()
        console.log(`[useRTC] 开始播放用户 ${user.uid} 的音频`)
      }

      // 视频流由组件层控制播放（通过ref绑定）

    } catch (error) {
      console.error(`[useRTC] 订阅用户 ${user.uid} 的 ${mediaType} 流失败:`, error)
      state.error = `订阅失败: ${(error as Error).message}`
    }
  }

  /**
   * 处理远程用户取消发布流事件
   * 
   * @param user - 远程用户对象
   * @param mediaType - 媒体类型（audio/video）
   */
  const handleUserUnpublished = (
    user: IAgoraRTCRemoteUser,
    mediaType: 'audio' | 'video'
  ): void => {
    console.log(`[useRTC] 用户 ${user.uid} 取消发布 ${mediaType} 流`)

    // 更新用户状态
    const existingUser = remoteUsers.value.find(u => u.uid === user.uid.toString())
    if (existingUser) {
      if (mediaType === 'audio') {
        existingUser.hasAudio = false
        existingUser.audioTrack = undefined
      }
      if (mediaType === 'video') {
        existingUser.hasVideo = false
        existingUser.videoTrack = undefined
      }
    }
  }

  /**
   * 处理远程用户离开频道事件
   * 
   * @param user - 远程用户对象
   */
  const handleUserLeft = (user: IAgoraRTCRemoteUser): void => {
    console.log(`[useRTC] 用户 ${user.uid} 离开频道`)

    // 从远程用户列表中移除
    const index = remoteUsers.value.findIndex(u => u.uid === user.uid.toString())
    if (index !== -1) {
      remoteUsers.value.splice(index, 1)
    }
  }

  // ==================== 步骤3：获取RTC访问Token ====================

  /**
   * 获取RTC访问Token
   * 
   * 功能：
   * - 通过环信SDK获取Agora RTC Token
   * - 提取并保存AppId、UID、Token信息
   * 
   * @returns {Promise<string | null>} 返回Token字符串，失败返回null
   * 
   * 说明：
   * 环信提供了getRTCToken接口，可以直接获取Agora的RTC Token，
   * 无需单独搭建Token服务器
   */
  const getAccessToken = async (): Promise<string | null> => {
    try {
      console.log('[useRTC] 开始获取RTC Token')

      if (!chatClient) {
        throw new Error('环信聊天客户端未初始化')
      }

      // 调用环信SDK获取RTC Token（'*'表示获取通用Token）
      const res = await chatClient.getRTCToken('*')

      if (!res?.data) {
        throw new Error('Token响应数据为空')
      }

      // 提取Token信息
      agoraAppId = res.data.appId
      agoraUid = res.data.RTCUId
      agoraToken = res.data.RTCToken

      console.log('[useRTC] 成功获取RTC Token', {
        appId: agoraAppId,
        uid: agoraUid
      })

      return agoraToken
    } catch (error) {
      const errorMsg = `获取RTC Token失败: ${(error as Error).message}`
      console.error('[useRTC]', errorMsg, error)
      state.error = errorMsg
      return null
    }
  }

  // ==================== 步骤4：加入RTC频道 ====================

  /**
   * 加入RTC频道
   * 
   * 功能：
   * - 获取RTC Token
   * - 加入Agora频道
   * - 更新状态信息
   * 
   * @throws {Error} 加入频道失败时抛出错误
   * 
   * 说明：
   * 加入频道后，观众可以自动接收主播的音视频流，
   * 主播需要额外调用publishTracks()发布自己的流
   */
  const joinChannel = async (): Promise<void> => {
    if (state.joined || state.joining) {
      console.warn('[useRTC] 已在频道中或正在加入，跳过')
      return
    }

    state.joining = true
    state.error = null

    try {
      console.log('[useRTC] 开始加入频道:', channelName)

      // 步骤3：获取RTC Token
      const token = await getAccessToken()
      if (!token) {
        throw new Error('获取RTC Token失败')
      }

      if (!client) {
        throw new Error('RTC客户端未初始化')
      }

      // 加入频道
      await client.join(token, channelName, null, agoraUid)
      
      // 更新状态
      state.joined = true
      state.channelId = channelName
      state.localUid = agoraUid

      console.log('[useRTC] 成功加入频道:', channelName, '本地UID:', agoraUid)

    } catch (error) {
      const errorMsg = `加入频道失败: ${(error as Error).message}`
      console.error('[useRTC]', errorMsg, error)
      state.error = errorMsg
      throw error
    } finally {
      state.joining = false
    }
  }

  /**
   * 关闭本地轨道（独立方法）
   * 
   * 功能：
   * - 停止并关闭本地音视频轨道
   * - 释放麦克风和摄像头设备
   * 
   * 说明：
   * 这是一个独立的轨道清理方法，必须在unpublish之后调用
   * 
   * @param cleanupVideoElement - 可选的清理回调，用于清理video元素的srcObject
   */
  const closeLocalTracks = async (cleanupVideoElement?: () => void): Promise<void> => {
    console.log('[useRTC] 开始关闭本地轨道...')

    // 关键：先清理video元素的srcObject（如果提供了清理回调）
    if (cleanupVideoElement) {
      try {
        console.log('[useRTC] 执行video元素清理回调...')
        cleanupVideoElement()
      } catch (error) {
        console.warn('[useRTC] 清理video元素时出错:', error)
      }
    }

    // 关闭本地音频轨道
    if (localAudioTrack.value) {
      try {
        console.log('[useRTC] 正在销毁本地音频轨道...')
        localAudioTrack.value.stop()
        localAudioTrack.value.close()
        localAudioTrack.value = null
        console.log('[useRTC] ✅ 本地音频轨道已销毁（麦克风应已释放）')
      } catch (error) {
        console.error('[useRTC] ❌ 销毁本地音频轨道时出错:', error)
        localAudioTrack.value = null
      }
    }

    // 关闭本地视频轨道
    if (localVideoTrack.value) {
      try {
        console.log('[useRTC] 正在销毁本地视频轨道...')
        localVideoTrack.value.stop()
        localVideoTrack.value.close()
        localVideoTrack.value = null
        console.log('[useRTC] ✅ 本地视频轨道已销毁（摄像头应已释放）')
      } catch (error) {
        console.error('[useRTC] ❌ 销毁本地视频轨道时出错:', error)
        localVideoTrack.value = null
      }
    }

    console.log('[useRTC] ✅ 本地轨道关闭完成')
  }

  /**
   * 发布本地音视频流（主播专用）
   * 
   * 功能：
   * - 将本地音视频轨道发布到频道中
   * - 让其他用户可以订阅并观看/收听
   * 
   * @throws {Error} 发布流失败时抛出错误
   * 
   * 重要说明：
   * 此方法必须由组件层显式调用，遵循"流发布职责分离规范"。
   * 不能在joinChannel内部自动调用，以确保：
   * 1. 组件层对流发布时机有完全控制权
   * 2. 可以在发布前后执行必要的准备和后续操作
   * 3. 符合单一职责原则，便于维护和调试
   * 
   * @example
   * ```typescript
   * await joinChannel()
   * await publishTracks() // 显式调用
   * playLocalVideo(videoElement)
   * ```
   */
  const publishTracks = async (): Promise<void> => {
    try {
      console.log('[useRTC] 开始发布本地音视频流')

      if (!client) {
        throw new Error('RTC客户端未初始化')
      }

      if (!localAudioTrack.value || !localVideoTrack.value) {
        throw new Error('本地音视频轨道未就绪')
      }

      // 发布本地音视频轨道到频道
      const tracks = [localAudioTrack.value, localVideoTrack.value].filter(Boolean)
      await client.publish(tracks as any[])

      console.log('[useRTC] 成功发布本地音视频流')

    } catch (error) {
      const errorMsg = `发布音视频流失败: ${(error as Error).message}`
      console.error('[useRTC]', errorMsg, error)
      state.error = errorMsg
      throw error
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 播放本地视频预览
   * 
   * @param element - 用于播放视频的HTMLVideoElement
   * 
   * 功能：
   * - 将本地视频轨道渲染到指定的video元素
   * - 提供备用播放方案（直接使用MediaStream）
   * 
   * 说明：
   * 主播在发布流后，通常需要看到自己的视频预览，
   * 这个方法将本地视频轨道绑定到video元素上进行播放
   */
  const playLocalVideo = (element: HTMLVideoElement): void => {
    if (!localVideoTrack.value) {
      console.warn('[useRTC] 本地视频轨道不存在，无法播放')
      return
    }

    try {
      // 使用Agora SDK的play方法播放
      localVideoTrack.value.play(element)
      console.log('[useRTC] 本地视频播放成功')
    } catch (error) {
      console.error('[useRTC] Agora播放失败，尝试备用方案:', error)
      
      // 备用方案：直接使用原生MediaStream
      try {
        const mediaStreamTrack = localVideoTrack.value.getMediaStreamTrack()
        if (mediaStreamTrack && element) {
          const stream = new MediaStream([mediaStreamTrack])
          element.srcObject = stream
          element.play().catch(e => console.error('[useRTC] 原生播放失败:', e))
        }
      } catch (fallbackError) {
        console.error('[useRTC] 备用播放方案也失败:', fallbackError)
      }
    }
  }

  /**
   * 离开RTC频道
   * 
   * 功能：
   * - 取消发布本地音视频流
   * - 关闭本地音视频轨道
   * - 停止远程音视频轨道播放
   * - 离开Agora频道
   * - 移除事件监听器
   * - 清理状态和资源
   * 
   * 说明：
   * 在组件卸载或用户主动离开时调用，确保资源正确释放，
   * 避免音视频设备占用和内存泄漏
   * 
   * 关键流程：
   * 1. 检查connectionState
   * 2. unpublish（必须在CONNECTED/CONNECTING状态）
   * 3. closeLocalTracks（stop + close）
   * 4. leave
   * 
   * @param cleanupVideoElement - 可选的清理回调，用于清理video元素的srcObject
   */
  const leaveChannel = async (cleanupVideoElement?: () => void): Promise<void> => {
    if (!client) {
      console.log('[useRTC] 客户端不存在，无需离开')
      return
    }

    try {
      console.log('[useRTC] 开始离开频道并清理资源，当前状态:', {
        joined: state.joined,
        connectionState: client.connectionState,
        hasAudio: !!localAudioTrack.value,
        hasVideo: !!localVideoTrack.value
      })

      // 1. 取消发布本地音视频流（检查连接状态）
      if (localAudioTrack.value || localVideoTrack.value) {
        const connectionState = client.connectionState
        console.log('[useRTC] 当前连接状态:', connectionState)
        
        if (connectionState === 'CONNECTED' || connectionState === 'CONNECTING') {
          try {
            const tracksToUnpublish: any[] = []
            if (localAudioTrack.value) tracksToUnpublish.push(localAudioTrack.value)
            if (localVideoTrack.value) tracksToUnpublish.push(localVideoTrack.value)
            
            if (tracksToUnpublish.length > 0) {
              await client.unpublish(tracksToUnpublish)
              console.log('[useRTC] ✅ 已取消发布本地音视频流')
            }
          } catch (error) {
            console.warn('[useRTC] 取消发布流时出错:', error)
          }
        } else {
          console.log('[useRTC] ⚠️ 连接状态为', connectionState, '，跳过unpublish')
        }
      }

      // 2. 关闭本地轨道（stop + close）
      await closeLocalTracks(cleanupVideoElement)

      // 3. 停止远程用户的音视频轨道播放
      if (remoteUsers.value.length > 0) {
        console.log('[useRTC] 停止远程用户轨道播放...')
        remoteUsers.value.forEach(user => {
          try {
            if (user.audioTrack) user.audioTrack.stop()
            if (user.videoTrack) user.videoTrack.stop()
          } catch (error) {
            console.warn(`[useRTC] 停止远程用户 ${user.uid} 的轨道时出错:`, error)
          }
        })
        console.log('[useRTC] ✅ 远程用户轨道已停止')
      }

      // 4. 移除事件监听器
      try {
        client.off('user-published', handleUserPublished)
        client.off('user-unpublished', handleUserUnpublished)
        client.off('user-left', handleUserLeft)
        console.log('[useRTC] ✅ 事件监听器已移除')
      } catch (error) {
        console.warn('[useRTC] 移除事件监听器时出错:', error)
      }

      // 5. 离开频道（检查连接状态）
      const connectionState = client.connectionState
      if (connectionState === 'CONNECTED' || connectionState === 'CONNECTING') {
        try {
          await client.leave()
          console.log('[useRTC] ✅ 已离开Agora频道')
        } catch (error) {
          console.warn('[useRTC] 离开频道时出错:', error)
        }
      } else {
        console.log('[useRTC] ⚠️ 连接状态为', connectionState, '，跳过leave')
      }

      // 6. 清空状态
      state.joined = false
      state.channelId = null
      state.localUid = null
      remoteUsers.value = []

      console.log('[useRTC] ✅✅✅ 成功离开频道并清理所有资源')

    } catch (error) {
      console.error('[useRTC] ❌ 离开频道时出错:', error)
      // 即使出错也要清空状态和轨道引用
      state.joined = false
      state.channelId = null
      state.localUid = null
      remoteUsers.value = []
      localAudioTrack.value = null
      localVideoTrack.value = null
      throw error
    }
  }

  /**
   * 获取Agora客户端实例
   * 
   * @returns {IAgoraRTCClient | null} Agora客户端实例
   * 
   * 说明：
   * 提供客户端实例访问，用于高级场景（如直接操作客户端API）
   */
  const getClient = (): IAgoraRTCClient | null => {
    return client
  }

  // ==================== 生命周期管理 ====================

  /**
   * 组件卸载时自动清理资源
   */
  onUnmounted(() => {
    console.log('[useRTC] 组件卸载，自动离开频道')
    leaveChannel()
  })

  // ==================== 返回Hook接口 ====================

  return {
    // 状态
    state,
    localVideoTrack,
    localAudioTrack,
    remoteUsers,

    // 方法（按使用流程顺序排列）
    initRTC,              // 步骤1：初始化RTC客户端
    setupEventListeners,  // 步骤2：挂载事件监听器
    getAccessToken,       // 步骤3：获取RTC Token
    joinChannel,          // 步骤4：加入频道
    publishTracks,        // 步骤5：发布流（主播）
    closeLocalTracks,     // 关闭本地轨道
    playLocalVideo,       // 播放本地视频预览
    leaveChannel,         // 离开频道
    getClient             // 获取客户端实例
  }
}
