import WebSDK, { EasemobChat, EasemobChatStatic } from 'easemob-websdk';

// eslint-disable-next-line new-cap
const EMClient = new WebSDK.connection({
  appKey: 'easemob-demo#support',
});
export { EMClient, EasemobChat, EasemobChatStatic };
