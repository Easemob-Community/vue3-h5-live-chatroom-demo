<template>
  <div class="live-config-page">
    <van-nav-bar title="直播间配置" left-arrow @click-left="onClickLeft" />

    <div class="config-form">
      <!-- 用户配置 -->
      <van-cell-group title="用户配置">
        <van-field v-model="form.userId" label="用户ID" placeholder="请输入用户ID" clearable />
        <!-- 进入直播间的昵称 -->
        <van-field v-model="form.nickname" label="昵称" placeholder="请输入进入直播间的昵称" clearable />
        <van-field v-model="form.password" label="密码" placeholder="请输入密码（密码和Token任选其一）" clearable />
        <van-field v-model="form.accessToken" label="AccessToken" placeholder="请输入访问令牌（密码和Token任选其一）" type="textarea"
          rows="2" clearable />
        <van-cell class="auth-tip">
          <template #title>
            <span class="tip-text">💡 密码和AccessToken任选其一填写即可</span>
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 角色选择 -->
      <van-cell-group title="角色选择">
        <van-cell title="加入身份">
          <template #right-icon>
            <van-radio-group v-model="form.role" direction="horizontal">
              <van-radio name="host">主播</van-radio>
              <van-radio name="audience">观众</van-radio>
            </van-radio-group>
          </template>
        </van-cell>
      </van-cell-group>

      <!-- 直播间模式 -->
      <van-cell-group title="直播间模式">
        <van-cell title="大型直播间模式">
          <template #right-icon>
            <van-switch v-model="form.isLargeMode" size="24px" active-color="#07c160" inactive-color="#dcdee0" />
          </template>
        </van-cell>
        <van-cell v-if="form.isLargeMode" class="mode-tip">
          <template #title>
            <span class="tip-text">大型模式下消息发送频率限制为1分钟1次</span>
          </template>
        </van-cell>
      </van-cell-group>

      <!-- RTC配置 -->
      <van-cell-group title="RTC配置">
        <van-field v-model="form.channelName" label="频道名称" placeholder="请输入RTC频道名称" clearable />
      </van-cell-group>

      <!-- 聊天室配置 -->
      <van-cell-group title="聊天室配置">
        <van-field v-model="form.signalingRoomId" label="信令聊天室ID" placeholder="请输入信令聊天室ID" clearable />
        <van-field v-model="form.interactiveRoomId" label="互动聊天室ID" placeholder="请输入互动聊天室ID" clearable />
      </van-cell-group>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <van-button type="primary" block round @click="saveConfig">
          保存配置
        </van-button>
        <van-button type="success" block round class="enter-btn" @click="enterLiveRoom">
          进入直播间
        </van-button>
        <van-button type="default" block round class="reset-btn" @click="resetConfig">
          重置为默认
        </van-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { showToast, showSuccessToast } from 'vant';
import { liveChatroomConfig } from '@/constants';

const router = useRouter();

// 表单数据
const form = ref({
  userId: '',
  nickname: '',
  password: '',
  accessToken: '',
  role: 'audience' as 'host' | 'audience',
  isLargeMode: false,
  channelName: '',
  signalingRoomId: '',
  interactiveRoomId: '',
});

// 默认配置
const defaultConfig = {
  userId: liveChatroomConfig.user.userId,
  nickname: liveChatroomConfig.user.nickname,
  password: liveChatroomConfig.user.password,
  accessToken: liveChatroomConfig.user.accessToken || '',
  role: 'host' as 'host' | 'audience',
  isLargeMode: false,
  channelName: liveChatroomConfig.rtc.channelName,
  signalingRoomId: liveChatroomConfig.chatrooms.signaling.roomId,
  interactiveRoomId: liveChatroomConfig.chatrooms.interactive.roomId,
};

// 本地存储key
const STORAGE_KEY = 'live_chatroom_config';

// 页面加载时读取配置
onMounted(() => {
  loadConfig();
});

// 加载配置
const loadConfig = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      form.value = { ...form.value, ...parsed };
    } else {
      // 使用默认配置
      form.value = { ...defaultConfig };
    }
  } catch (error) {
    console.error('加载配置失败', error);
    form.value = { ...defaultConfig };
  }
};

// 保存配置
const saveConfig = () => {
  try {
    // 表单验证
    if (!form.value.userId.trim()) {
      showToast('请输入用户ID');
      return;
    }

    // 验证密码和Token至少填写一个
    if (!form.value.password.trim() && !form.value.accessToken.trim()) {
      showToast('密码和AccessToken至少填写一个');
      return;
    }

    if (!form.value.channelName.trim()) {
      showToast('请输入频道名称');
      return;
    }
    if (!form.value.signalingRoomId.trim()) {
      showToast('请输入信令聊天室ID');
      return;
    }
    if (!form.value.interactiveRoomId.trim()) {
      showToast('请输入互动聊天室ID');
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(form.value));
    showSuccessToast('配置已保存');
  } catch (error) {
    console.error('保存配置失败', error);
    showToast('保存失败');
  }
};

// 进入直播间
const enterLiveRoom = () => {
  // 先保存配置
  saveConfig();
  // 跳转到直播间
  router.push('/im/livechatroom/live');
};

// 重置配置
const resetConfig = () => {
  form.value = { ...defaultConfig };
  localStorage.removeItem(STORAGE_KEY);
  showSuccessToast('已重置为默认配置');
};

// 返回
const onClickLeft = () => {
  router.back();
};
</script>

<style scoped>
.live-config-page {
  min-height: 100vh;
  background-color: #f5f5f5;
}

.config-form {
  padding-bottom: 20px;
}

:deep(.van-cell-group) {
  margin-top: 12px;
}

:deep(.van-cell-group__title) {
  font-size: 14px;
  color: #666;
  padding: 12px 16px 8px;
}

:deep(.van-radio) {
  margin-right: 16px;
}

.mode-tip {
  background-color: #fffbe8;
}

.tip-text {
  font-size: 12px;
  color: #ed6a0c;
}

.action-buttons {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.enter-btn {
  margin-top: 8px;
}

.reset-btn {
  margin-top: 8px;
}

.auth-tip {
  background-color: #ecf5ff;
}

.auth-tip .tip-text {
  font-size: 12px;
  color: #409eff;
}
</style>
