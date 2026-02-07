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
export
class LiveRTC {
  client: IAgoraRTCClient | null = null
  agoraAppId: string | null = null
  agoraUid: string | null = null
  agoraToken: string | null = null
  constructor(EMClient: EasemobChat.Connection) {
    this.getAccessToken(EMClient)
  }
  //初始化RTC
 async initRTC(role: ClientRole): Promise<void> {
    try {
      AgoraRTC.setLogLevel(4)
      this.client = AgoraRTC.createClient({ mode: 'live', codec: 'h264' })
      this.client.setClientRole(role)
      console.log('AgoraRTC client initialized current role:', role)
    } catch (error) {
      console.error('Error initializing RTC:', error)
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
  async joinRTC(channel: string, uid: string, token: string): Promise<void> {
    try {
      if (!this.client) {
        console.error('Client is not initialized')
        return
      }
      await this.client.join(token, channel, null, uid)
      console.log('Joined channel:', channel, 'with uid:', uid)
    } catch (error) {
      console.error('Error joining RTC channel:', error)
    }
  }
  // 离开RTC频道
  async leaveRTC(): Promise<void> {
    try {
      if (!this.client) {
        console.error('Client is not initialized')
        return
      }
      await this.client.leave()
      console.log('Left channel')
    } catch (error) {
      console.error('Error leaving RTC channel:', error)
    }
  }
  //获取RTC Client
  getClient(): IAgoraRTCClient | null {
    return this.client
  }
}
