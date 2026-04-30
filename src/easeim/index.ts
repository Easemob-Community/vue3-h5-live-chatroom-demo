import WebSDK, { EasemobChat, EasemobChatStatic } from 'easemob-websdk';
if (process.env.NODE_ENV === 'production') {
  WebSDK.logger.setLevel('WARN');
}
if (process.env.NODE_ENV === 'development') {
  WebSDK.logger.setLevel('DEBUG');
}

// eslint-disable-next-line new-cap
const EMClient = new WebSDK.connection({
  appKey: 'easemob-demo#support',
});
const version = EMClient.version;
console.log('+++++', version);
export { WebSDK, EMClient, EasemobChat, EasemobChatStatic };
