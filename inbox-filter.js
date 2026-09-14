const aliases = ['admin','billing','dispatch','info'].map(x=>x+'@harperloadboard.com');
function isHarperMessage(message) {
  return [...(message.toRecipients||[]),...(message.ccRecipients||[]),message.from].some(x=>aliases.includes(String(x?.emailAddress?.address||'').toLowerCase()));
}
module.exports = { aliases, isHarperMessage };
