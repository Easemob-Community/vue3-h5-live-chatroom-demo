import WebSDK, { EasemobChat, EasemobChatStatic } from 'easemob-websdk';

// eslint-disable-next-line new-cap
const EMClient = new WebSDK.connection({
  appKey: 'YOUR APPKEY',
});
export { EMClient, EasemobChat, EasemobChatStatic };
