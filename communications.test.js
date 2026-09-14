const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCommunications } = require('./communications');
const input = { requestId:'12345678-1234-1234-1234-123456789abc', from:'dispatch@harperloadboard.com', recipient:'test@example.com', subject:'Test', message:'Delivery test' };
const actor = { id:'staff' };
function setup(fetchImpl, persist = () => {}) { const s = {}; return createCommunications({ getStore:() => s, persist, fetchImpl, env:{TWILIO_API_KEY_SID:'key',TWILIO_API_KEY_SECRET:'secret'} }); }
test('duplicate request sends once; confirmed delivery is distinct from accepted', async () => {
 let sends=0; const c=setup(async (url,options)=>{ if(options.method==='POST'){sends++;return {status:202,json:async()=>({operationId:'comms_operation_test'})};} return {ok:true,json:async()=>({stats:{delivered:1}})}; });
 assert.equal((await c.send(input,actor)).status,'accepted');await c.send(input,actor);assert.equal(sends,1);await c.refresh();assert.equal(c.state().messages[0].status,'delivered');
 await assert.rejects(c.send({...input,subject:'Different'},actor),{statusCode:409});
});
test('uncertain provider response does not resend', async()=>{let count=0;const c=setup(async()=>{count++;throw Error('timeout');});assert.equal((await c.send(input,actor)).status,'uncertain');await c.send(input,actor);assert.equal(count,1);});
test('storage failure prevents network send',async()=>{let count=0;const c=setup(async()=>{count++;},()=>{throw Error('disk');});await assert.rejects(c.send(input,actor));assert.equal(count,0);});
test('reject sender spoofing, multiple recipients and header injection',async()=>{const c=setup(()=>{throw Error('must not send');});for(const patch of [{from:'someone@another.com'},{recipient:'a@example.com,b@example.com'},{subject:'Hi\r\nBcc: other@example.com'}]) await assert.rejects(c.send({...input,...patch},actor),{statusCode:400});});
test('restart preserves interrupted send as uncertain',()=>{const s={communications:[{...input,id:input.requestId,status:'sending'}]};const c=createCommunications({getStore:()=>s,persist:()=>{}});c.recover();assert.equal(c.state().messages[0].status,'uncertain');});
