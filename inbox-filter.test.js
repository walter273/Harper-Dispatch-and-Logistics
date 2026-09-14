const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isHarperMessage}=require('./inbox-filter');
const recipient=address=>({emailAddress:{address}});
test('Harper filtering includes company To and Cc addresses',()=>{
 assert.equal(isHarperMessage({toRecipients:[recipient('Dispatch@harperloadboard.com')]}),true);
 assert.equal(isHarperMessage({ccRecipients:[recipient('billing@harperloadboard.com')]}),true);
});
test('unrelated personal mail and lookalike domains stay excluded',()=>{
 for(const address of ['wharper031@outlook.com','dispatch@harperloadboard.com.evil.test','other@harperloadboard.com'])assert.equal(isHarperMessage({toRecipients:[recipient(address)],subject:'Harper'}),false);
 assert.equal(isHarperMessage({}),false);
});
