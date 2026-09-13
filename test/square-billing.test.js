const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createSquareBilling, quote, entitled } = require('../square-billing');
const { createSquareWorkflow } = require('../square-workflow');
const env = { SQUARE_SANDBOX_ACCESS_TOKEN:'fixture', SQUARE_SANDBOX_LOCATION_ID:'location', ALPHAWAY_PUBLIC_ORIGIN:'https://harper.example' };
const result = data => ({ok:true,json:async()=>data});
test('Square defaults to sandbox and live collection is locked without explicit release',async()=>{
  const calls=[];const b=createSquareBilling({...env,SQUARE_ACCESS_TOKEN:'live'},async(url)=>{calls.push(url);return result({location:{id:'location',status:'ACTIVE',currency:'USD',capabilities:['CREDIT_CARD_PROCESSING']}});});
  await b.verify();assert.ok(calls[0].startsWith('https://connect.squareupsandbox.com/'));
  assert.equal(createSquareBilling({...env,SQUARE_ENVIRONMENT:'production',SQUARE_LOCATION_ID:'location',SQUARE_ACCESS_TOKEN:'fixture'}).ready,false);
  assert.equal(entitled({provider:'square',environment:'sandbox',status:'active',currentPeriodEnd:Date.now()/1000+1000}),false);
  assert.equal(entitled({provider:'square',environment:'production',status:'active',currentPeriodEnd:1}),false);
});
test('server prices preserve fleet quantity and invalid plans cannot create a payment',()=>{
 assert.equal(quote('dispatch-basic',3).amount,90000);assert.equal(quote('shipper').amount,79900);
 for(const args of [['bad',1],['broker',2],['dispatch-basic',0],['dispatch-basic',1.5]])assert.throws(()=>quote(...args));
});
test('checkout retries reuse IDs; onboarding is one time and recurring pricing excludes setup',async()=>{
 const calls=[];const b=createSquareBilling(env,async(url,opt)=>{const body=opt.body&&JSON.parse(opt.body);calls.push({url,body});return result(url.includes('/locations/')?{location:{id:'location',status:'ACTIVE',currency:'USD',capabilities:['CREDIT_CARD_PROCESSING']}}:url.endsWith('/catalog/object')?{catalog_object:{id:body.object.type==='SUBSCRIPTION_PLAN'?'plan':'variation'}}:{payment_link:{id:'link',order_id:'order',url:'https://sandbox.square.link/u/test'}});});
 const e={id:'entry',plan:'dispatch-basic',truckCount:2}; await b.createLink(e,true);await b.createLink(e,true);await b.createLink(e,false);
 const links=calls.filter(c=>c.url.endsWith('/payment-links')).map(c=>c.body);
 assert.equal(links[0].idempotency_key,links[1].idempotency_key);assert.equal(links[0].quick_pay.price_money.amount,15000);assert.equal(links[2].quick_pay.price_money.amount,60000);assert.equal(links[2].checkout_options.allow_tipping,false);
 assert.equal(links[2].checkout_options.subscription_plan_id,'variation');
});
test('Square invoiced period requires a matching paid invoice and an unrefunded payment',async()=>{
 let until='2020-01-01',customer='customer',invoiceStatus='UNPAID',refunded=0;
 const b=createSquareBilling(env,async url=>result(
 url.includes('/orders/')?{order:{id:'order',location_id:'location',total_money:{amount:29900,currency:'USD'},state:'OPEN',tenders:[{id:'payment'}]}}:
 url.includes('/payments/')?{payment:{status:'COMPLETED',order_id:'order',location_id:'location',amount_money:{amount:29900,currency:'USD'},customer_id:'customer',refunded_money:{amount:refunded}}}:
 url.includes('/invoices/')?{invoice:{subscription_id:'sub',location_id:'location',primary_recipient:{customer_id:'customer'},status:invoiceStatus,order_id:'order'}}:
 {subscriptions:[{id:'sub',customer_id:customer,location_id:'location',plan_variation_id:'variation',status:'ACTIVE',charged_through_date:until,invoice_ids:['invoice'],timezone:'UTC'}]}));
 const e={id:'entry',environment:'sandbox',plan:'broker',truckCount:1,subscriptionLink:{orderId:'order',variationId:'variation'}};
 assert.equal((await b.refresh(e)).status,'past_due');
 until='2099-01-01'; assert.equal((await b.refresh(e)).status,'past_due');
 invoiceStatus='PAID'; assert.equal((await b.refresh(e)).status,'active');
 customer='another-customer'; assert.equal((await b.refresh(e)).subscriptionId,undefined);
 customer='customer'; refunded=29900; assert.notEqual((await b.refresh(e)).status,'active');
});
test('Square inclusive billing dates expire at the following midnight in subscription timezone',()=>{
 const {periodEnd}=require('../square-billing');
 assert.equal(periodEnd('2026-09-12','UTC'),Date.parse('2026-09-13T00:00:00Z')/1000);
 assert.equal(periodEnd('2026-09-12','America/Denver'),Date.parse('2026-09-13T06:00:00Z')/1000);
 assert.equal(periodEnd('2026-11-01','America/Denver'),Date.parse('2026-11-02T07:00:00Z')/1000);
 assert.equal(periodEnd(null),0);
});
test('webhook payload tampering is rejected and callbacks alone cannot grant entitlement',()=>{
 const config={...env,SQUARE_SANDBOX_WEBHOOK_SIGNATURE_KEY:'key',SQUARE_WEBHOOK_URL:'https://harper.example/api/square/webhook'};const b=createSquareBilling(config);
 const raw=Buffer.from(JSON.stringify({event_id:'event',type:'subscription.updated'}));const signature=crypto.createHmac('sha256','key').update(config.SQUARE_WEBHOOK_URL).update(raw).digest('base64');
 assert.equal(b.event(raw,signature).event_id,'event');assert.throws(()=>b.event(Buffer.from('{}'),signature),{statusCode:400});
});
test('sandbox workflow rejects customers and cannot write production entitlements',async()=>{
 const store={squareBilling:[],operations:{billingSubscriptions:[]},carrierOnboardedCompanies:[]};const b={environment:'sandbox',ready:true,refresh:async e=>({...e,status:'active',subscriptionId:'sub',setupPaid:true,currentPeriodEnd:9999999999}),createLink:async()=>({url:'https://sandbox.square.link/test'})};const workflow=createSquareWorkflow({billing:b,getStore:()=>store,persist:()=>{}});
 await assert.rejects(workflow.start({id:'customer',companyId:'company',role:'broker'},{plan:'broker',truckCount:1}),{statusCode:503});
 const admin={id:'admin',companyId:'company',role:'admin'};await workflow.start(admin,{plan:'broker',truckCount:1});await workflow.state(admin,true);assert.equal(store.operations.billingSubscriptions.length,0);assert.equal(store.carrierOnboardedCompanies.length,0);
 const other={id:'admin2',companyId:'another',role:'admin'};assert.equal((await workflow.state(other)).entry,null);
});
test('failed persistence retries preserve checkout identity before issuing remote payment links',async()=>{
 const store={squareBilling:[],operations:{billingSubscriptions:[]},carrierOnboardedCompanies:[]};let calls=0;const b={environment:'sandbox',ready:true,refresh:async e=>e,createLink:async()=>{calls++;return {url:'https://sandbox.square.link/test'};}};let fail=false;
 const w=createSquareWorkflow({billing:b,getStore:()=>store,persist:()=>{if(fail)throw Error('disk');}});const a={id:'admin',companyId:'company',role:'admin'};
 await w.start(a,{plan:'broker',truckCount:1});fail=true;await assert.rejects(w.next(a));assert.equal(calls,0);
});
test('revoked approval prevents a previously prepared checkout from taking payment',async()=>{
 const store={squareBilling:[],operations:{billingSubscriptions:[]},carrierOnboardedCompanies:[]};let requests=0;
 const b={environment:'sandbox',ready:true,refresh:async e=>e,createLink:async()=>{requests++;}};
 const w=createSquareWorkflow({billing:b,getStore:()=>store,persist:()=>{},validate:()=>{throw Object.assign(Error('Approval revoked'),{statusCode:403});}});
 const a={id:'admin',companyId:'company',role:'admin'};await w.start(a,{plan:'dispatch-basic',truckCount:1,onboardingRequired:true});
 await assert.rejects(w.next(a),{statusCode:403});assert.equal(requests,0);
});

test('production connection verification never unlocks production mutations',async()=>{
 let calls=0;
 const b=createSquareBilling({...env,SQUARE_ENVIRONMENT:'production',SQUARE_ACCESS_TOKEN:'fixture',SQUARE_LOCATION_ID:'location',SQUARE_LIVE_PAYMENTS_ENABLED:'false'},async()=>{calls++;return result({location:{id:'location',status:'ACTIVE',currency:'USD',capabilities:['CREDIT_CARD_PROCESSING']}});});
 assert.equal((await b.verify()).collectionEnabled,false);
 assert.equal(b.ready,false);
 await assert.rejects(b.cancel({subscriptionId:'sub',environment:'production'}),{statusCode:503});
 await assert.rejects(b.createLink({id:'x',plan:'broker',truckCount:1}),{statusCode:503});
 assert.equal(calls,2);
});
