import AgoraRTC, {
  type IAgoraRTCClient,
  type ClientRole,
  type IAgoraRTCRemoteUser,
  type ICameraVideoTrack,
  type IMicrophoneAudioTrack,
  type IRemoteAudioTrack,
  type IRemoteVideoTrack,
  type VideoEncoderConfigurationPreset,
} from 'agora-rtc-sdk-ng'
import { EasemobChat } from './index'

/* 封装直播RTC相关类 */
export class LiveRTC {
  client: IAgoraRTCClient | null = null
  channelName: string | null = null
  agoraAppId: string | null = null
  agoraUid: string | null = null
  agoraToken: string | null = null
  
  // 本地音视频轨道
  localAudioTrack: IMicrophoneAudioTrack | null = null
  localVideoTrack: ICameraVideoTrack | null = null
  
  // 当前角色
  currentRole: ClientRole = 'audience'
  
  constructor(channelName: string) {
    console.log('LiveRTC initialized')
    this.channelName = channelName
  }
  
  // 初始化RTC
  async initRTC(role: ClientRole): Promise<void> {
    try {
      this.currentRole = role
      // AgoraRTC.setLogLevel(4)
      this.client = AgoraRTC.createClient({ mode: 'live', codec: 'h264' })
      await this.client.setClientRole(role)
      console.log('AgoraRTC client initialized current role:', role)
      
      // 如果是主播角色，创建本地音视频轨道
      if (role === 'host') {
        await this.createLocalTracks()
      }
    } catch (error) {
      console.error('Error initializing RTC:', error)
      throw error
    }
  }
  
  // 创建本地音视频轨道（主播使用）
  async createLocalTracks(): Promise<void> {
    try {
      // 创建麦克风音频轨道
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack()
      console.log('麦克风音频轨道创建成功')
      
      // 创建摄像头视频轨道
      this.localVideoTrack = await AgoraRTC.createCameraVideoTrack({
        encoderConfig: '480p_1',
      })
      console.log('摄像头视频轨道创建成功')
    } catch (error) {
      console.error('创建本地轨道失败:', error)
      throw error
    }
  }
  
  // 获取本地视频轨道
  getLocalVideoTrack(): ICameraVideoTrack | null {
    return this.localVideoTrack
  }
  
  // 获取本地音频轨道
  getLocalAudioTrack(): IMicrophoneAudioTrack | null {
    return this.localAudioTrack
  }
  
  // 播放本地视频
  playLocalVideo(element: HTMLVideoElement): void {
    if (this.localVideoTrack) {
      try {
        this.localVideoTrack.play(element)
        console.log('Agora本地视频播放成功')
      } catch (error) {
        console.error('Agora本地视频播放失败:', error)
        // 备选方案：直接获取媒体流并设置到video元素
        const mediaStream = this.localVideoTrack.getMediaStreamTrack()
        if (mediaStream && element) {
          const stream = new MediaStream([mediaStream])
          element.srcObject = stream
          element.play().catch(e => console.error('原生视频播放失败:', e))
        }
      }
    } else {
      console.warn('本地视频轨道不存在，无法播放')
    }
  }
    /**
   * 获取 RTC AccessToken
   */
  async getAccessToken(chatClient: EasemobChat.Connection): Promise<string | null> {
    try {
      if (!chatClient) {
        console.error('获取Token失败: ChatClient未初始化')
        return null
      }
      
      // 调用环信SDK的getRTCToken方法获取Agora Token
      // 参数 '*' 表示获取通用的RTC Token
      const res = await chatClient.getRTCToken('*')
      
      // 从响应中提取必要信息
      if (!res?.data) {
        console.error('获取Token失败: 响应数据为空')
        return null
      }
      
      this.agoraAppId = res.data.appId
      this.agoraUid = res.data.RTCUId
      this.agoraToken = res.data.RTCToken
      
      console.info('成功获取RTC Token', { 
        appId: this.agoraAppId, 
        uid: this.agoraUid 
      })
      
      return this.agoraToken
    } catch (error: any) {
      console.error('获取RTC Token失败:', error)
      return null
    }
  }
  // 加入RTC频道
  async joinRTC(onJoined?: () => void | Promise<void>): Promise<void> {
    try {
      if (!this.client) {
        console.error('Client is not initialized')
        return
      }
      if (!this.channelName || !this.agoraUid || !this.agoraToken) {
        console.error('Channel name, uid, or token is missing')
        return
      }
      await this.client.join(this.agoraToken, this.channelName, null, this.agoraUid)
      console.log('Joined channel:', this.channelName, 'with uid:', this.agoraUid)
      
      // 如果提供了回调，执行回调（让组件内控制流发布）
      if (onJoined) {
        await onJoined()
      }
    } catch (error) {
      console.error('Error joining RTC channel:', error)
      throw error
    }
  }

  // 发布本地音视频流（供组件调用）
  async publishLocalTracks(): Promise<void> {
    try {
      if (!this.client) {
        console.error('Client is not initialized')
        return
      }
      if (this.localAudioTrack && this.localVideoTrack) {
        await this.client.publish([this.localAudioTrack, this.localVideoTrack])
        console.log('主播已发布本地音视频流')
      } else {
        console.warn('本地音视频轨道未就绪，无法发布')
      }
    } catch (error) {
      console.error('发布本地音视频流失败:', error)
      throw error
    }
  }
  // 离开RTC频道
  async leaveRTC(): Promise<void> {
    try {
      // 停止并关闭本地音视频轨道
      if (this.localAudioTrack) {
        this.localAudioTrack.stop()
        this.localAudioTrack.close()
        this.localAudioTrack = null
      }
      if (this.localVideoTrack) {
        this.localVideoTrack.stop()
        this.localVideoTrack.close()
        this.localVideoTrack = null
      }
      
      if (!this.client) {
        console.error('Client is not initialized')
        return
      }
      await this.client.leave()
      console.log('Left channel')
    } catch (error) {
      console.error('Error leaving RTC channel:', error)
      throw error
    }
  }
  //获取RTC Client
  getClient(): IAgoraRTCClient | null {
    return this.client
  }
}
