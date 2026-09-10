const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

async function start(extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(ALPHAWAY_|STRIPE_|NODE_ENV$|PORT$|HOST$)/.test(key)));
  const child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname,'..'), env: {...env, PORT:'0', ALPHAWAY_HOST:'127.0.0.1', ...extra}, windowsHide: true });
  let output = '', errors = '';
  const url = await new Promise((resolve,reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Server startup timed out')); },10000);
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`Server exited before ready: ${errors}`)); });
  });
  return { url, async stop() { if (child.exitCode !== null) return; const done = once(child,'exit'); child.kill(); await done; } };
}
test('HTTP health, missing config, signature validation, retry persistence and storage failure', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'alphaway-test-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const file = path.join(dir,'store.json');
  const secret = crypto.randomBytes(32).toString('hex');
  const config = {ALPHAWAY_DATA_FILE:file, STRIPE_WEBHOOK_SECRET:secret, STRIPE_ACCOUNT_ID:'acct_1UDJTIKqpp58H3DU'};
  let app = await start(config); t.after(() => app.stop());
  assert.equal((await fetch(`${app.url}/api/health`)).status,200);
  const navigation = await fetch(`${app.url}/account-nav.js`);
  assert.equal(navigation.status, 200);
  assert.match(navigation.headers.get('content-type'), /javascript/);
  assert.match(await navigation.text(), /data-admin-nav/);
  assert.equal((await fetch(`${app.url}/api/stripe/checkout`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan:'broker'})})).status,503);
  assert.equal((await fetch(`${app.url}/api/stripe/checkout`,{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.example'},body:'{}'})).status,403);
  const event = { id:'evt_http',type:'customer.subscription.updated',created:Math.floor(Date.now()/1000),livemode:false,data:{object:{id:'sub_http',customer:'cus_http',status:'active',metadata:{userId:'user-1',companyId:'company-1'}}} };
  async function send(value, valid = true) {
    const raw = JSON.stringify(value), timestamp = Math.floor(Date.now()/1000);
    const digest = crypto.createHmac('sha256',secret).update(`${timestamp}.${raw}`).digest('hex');
    return fetch(`${app.url}/api/stripe/webhook`,{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${valid?digest:'0'.repeat(64)}`},body:raw});
  }
  assert.equal((await send(event,false)).status,400);
  assert.equal((await send(event)).status,200);
  assert.equal((await send(event)).status,200);
  let saved=JSON.parse(fs.readFileSync(file)); assert.equal(saved.operations.billingEvents.length,1);
  assert.equal(saved.operations.billingEvents[0].subscriptionId,'sub_http');
  assert.equal(saved.operations.billingSubscriptions[0].status,'active');
  assert.equal(saved.operations.billingSubscriptions[0].userId,'user-1');
  await app.stop(); app=await start(config);
  assert.equal((await send(event)).status,200);
  saved=JSON.parse(fs.readFileSync(file)); assert.equal(saved.operations.billingEvents.length,1);
  assert.equal(saved.operations.billingEvents[0].companyId,'company-1');
  assert.equal((await send({...event,id:'evt_older',created:event.created-1,type:'customer.subscription.deleted'})).status,200);
  assert.equal(JSON.parse(fs.readFileSync(file)).operations.billingSubscriptions[0].status,'active');
  assert.equal((await send({...event,id:'evt_checkout',type:'checkout.session.completed',data:{object:{id:'cs_test',subscription:'sub_http',status:'complete',payment_status:'paid',metadata:{plan:'carrier',onboardingCharged:'true',companyId:'company-1'}}}})).status,200);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).carrierOnboardedCompanies,['company-1']);
  await app.stop(); app=await start(config);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)).carrierOnboardedCompanies,['company-1']);
  assert.equal(JSON.parse(fs.readFileSync(file)).operations.billingSubscriptions[0].status,'active');
  fs.renameSync(file,`${file}.backup`); fs.mkdirSync(file);
  assert.equal((await send({...event,id:'evt_retry'})).status,503);
  fs.rmdirSync(file); fs.renameSync(`${file}.backup`,file);
  assert.equal((await send({...event,id:'evt_retry'})).status,200);
  assert.equal(JSON.parse(fs.readFileSync(file)).operations.billingEvents.length,4);
});
test('hosted preview gates Checkout, secures cookies, and revokes signed-out sessions', async (t) => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alphaway-auth-test-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const password=crypto.randomBytes(24).toString('hex'), invite=crypto.randomBytes(24).toString('hex');
  const app=await start({NODE_ENV:'production',ALPHAWAY_DATA_FILE:path.join(dir,'store.json'),ALPHAWAY_REQUIRE_AUTH:'true',ALPHAWAY_PREVIEW_USERNAME:'review',ALPHAWAY_PREVIEW_PASSWORD:password,ALPHAWAY_PRIVATE_NETWORK:'true',ALPHAWAY_NETWORK_INVITE_CODE:invite,ALPHAWAY_ACCOUNT_AUTH:'true',ALPHAWAY_ADMIN_EMAIL:'admin@example.com',ALPHAWAY_ADMIN_PASSWORD:password,STRIPE_ACCOUNT_ID:'acct_1UDJTIKqpp58H3DU'});
  t.after(()=>app.stop());
  const headers={'content-type':'application/json',authorization:`Basic ${Buffer.from(`review:${password}`).toString('base64')}`};
  const post=(route,body={},cookie='')=>fetch(`${app.url}${route}`,{method:'POST',headers:{...headers,cookie},body:JSON.stringify(body)});
  assert.equal((await fetch(`${app.url}/`)).status,401);
  assert.equal((await post('/api/stripe/checkout',{plan:'carrier'})).status,403);
  const access=await post('/api/access',{code:invite}); const inviteCookie=access.headers.get('set-cookie');
  assert.match(inviteCookie,/; Secure/);
  assert.equal((await post('/api/stripe/checkout',{plan:'carrier'},inviteCookie.split(';')[0])).status,401);
  const signin=await post('/api/accounts/signin',{email:'admin@example.com',password}); const accountCookie=signin.headers.get('set-cookie');
  assert.match(accountCookie,/; Secure/);
  const cookies=`${inviteCookie.split(';')[0]}; ${accountCookie.split(';')[0]}`;
  assert.equal((await post('/api/stripe/checkout',{plan:'carrier'},cookies)).status,503);
  assert.equal((await post('/api/accounts/signout',{},cookies)).status,200);
  assert.equal((await post('/api/stripe/checkout',{plan:'carrier'},cookies)).status,401);
  assert.equal((await fetch(`${app.url}/api/stripe/webhook`,{method:'POST',body:'{}'})).status,503);
});

test('subscription webhook activates paid operations access for a linked account', async (t) => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alphaway-subscription-test-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const password=crypto.randomBytes(24).toString('hex'), inviteCode=crypto.randomBytes(24).toString('hex'), webhookSecret=crypto.randomBytes(32).toString('hex');
  const app=await start({NODE_ENV:'production',ALPHAWAY_DATA_FILE:path.join(dir,'store.json'),ALPHAWAY_REQUIRE_AUTH:'true',ALPHAWAY_PREVIEW_USERNAME:'review',ALPHAWAY_PREVIEW_PASSWORD:password,ALPHAWAY_PRIVATE_NETWORK:'true',ALPHAWAY_NETWORK_INVITE_CODE:inviteCode,ALPHAWAY_ACCOUNT_AUTH:'true',ALPHAWAY_REQUIRE_SUBSCRIPTION:'true',ALPHAWAY_ADMIN_EMAIL:'admin@example.com',ALPHAWAY_ADMIN_PASSWORD:password,STRIPE_ACCOUNT_ID:'acct_1UDJTIKqpp58H3DU',STRIPE_WEBHOOK_SECRET:webhookSecret});
  t.after(()=>app.stop());
  const basic={authorization:`Basic ${Buffer.from(`review:${password}`).toString('base64')}`,'content-type':'application/json'};
  const post=(route,body,cookie='')=>fetch(`${app.url}${route}`,{method:'POST',headers:{...basic,cookie},body:JSON.stringify(body)});
  const adminSignin=await post('/api/accounts/signin',{email:'admin@example.com',password});
  const adminCookie=adminSignin.headers.get('set-cookie').split(';')[0];
  const invitation=await (await post('/api/accounts/invitations',{email:'carrier@example.com',role:'carrier-owner',companyId:'carrier-one'},adminCookie)).json();
  const accepted=await (await post('/api/accounts/accept',{token:invitation.invitation.token,name:'Carrier Owner',password})).json();
  const carrierSignin=await post('/api/accounts/signin',{email:'carrier@example.com',password});
  const carrierCookie=carrierSignin.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${app.url}/api/operations`,{headers:{...basic,cookie:carrierCookie}})).status,402);
  const event={id:'evt_subscription_access',type:'customer.subscription.updated',created:Math.floor(Date.now()/1000),livemode:false,data:{object:{id:'sub_access',customer:'cus_access',status:'active',current_period_end:Math.floor(Date.now()/1000)+2592000,metadata:{userId:accepted.account.id,companyId:'carrier-one',plan:'carrier'}}}};
  const raw=JSON.stringify(event), timestamp=Math.floor(Date.now()/1000), signature=crypto.createHmac('sha256',webhookSecret).update(`${timestamp}.${raw}`).digest('hex');
  assert.equal((await fetch(`${app.url}/api/stripe/webhook`,{method:'POST',headers:{'stripe-signature':`t=${timestamp},v1=${signature}`},body:raw})).status,200);
  assert.equal((await fetch(`${app.url}/api/operations`,{headers:{...basic,cookie:carrierCookie}})).status,200);
  const subscription=await (await fetch(`${app.url}/api/stripe/subscription`,{headers:{...basic,cookie:carrierCookie}})).json();
  assert.equal(subscription.subscription.status,'active');
  assert.equal(subscription.subscription.customerId,undefined);
});


test('account auth protects intakes and catalog even without preview basic auth', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alphaway-access-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const password = crypto.randomBytes(24).toString('hex');
  const app = await start({ ALPHAWAY_DATA_FILE: path.join(dir, 'store.json'), ALPHAWAY_ACCOUNT_AUTH: 'true', ALPHAWAY_ADMIN_EMAIL: 'admin@example.com', ALPHAWAY_ADMIN_PASSWORD: password, RAILWAY_ENVIRONMENT_ID: 'test-environment' });
  t.after(() => app.stop());
  const post = (route, body, cookie = '') => fetch(app.url + route, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
  assert.equal((await fetch(app.url + '/api/intakes')).status, 403);
  assert.equal((await post('/api/events', { type: 'catalog.reset', baseRevision: 0 })).status, 401);
  const signin = await post('/api/accounts/signin', { email: 'admin@example.com', password });
  assert.equal(signin.status, 200);
  assert.match(signin.headers.get('set-cookie'), /; Secure/);
  const cookie = signin.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(app.url + '/api/intakes', { headers: { cookie } })).status, 200);
  const snapshot = await (await fetch(app.url + '/api/app')).json();
  assert.equal((await post('/api/events', { type: 'catalog.reset', baseRevision: snapshot.revision }, cookie)).status, 200);
});


test('company boundaries apply to HTTP snapshots, stream updates, invitations and restart', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alphaway-tenants-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'store.json'), password=crypto.randomBytes(24).toString('hex');
  const config={ALPHAWAY_DATA_FILE:file,ALPHAWAY_ACCOUNT_AUTH:'true',ALPHAWAY_ADMIN_EMAIL:'admin@example.com',ALPHAWAY_ADMIN_PASSWORD:password};
  let app=await start(config); t.after(()=>app.stop());
  const post=(route,body,cookie='')=>fetch(app.url+route,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(body)});
  const get=(route,cookie='')=>fetch(app.url+route,{headers:{cookie}});
  const admin=(await post('/api/accounts/signin',{email:'admin@example.com',password})).headers.get('set-cookie').split(';')[0];
  async function account(email,role,companyId,name=email) {
    const invite=await (await post('/api/accounts/invitations',{email,role,companyId},admin)).json();
    const response=await post('/api/accounts/accept',{token:invite.invitation.token,name,password});
    assert.equal(response.status,201);
    return {cookie:response.headers.get('set-cookie').split(';')[0],user:(await response.json()).account};
  }
  const a=await account('shipper@example.com','shipper','a');
  const b=await account('broker@example.com','broker','b');
  const driver=await account('driver@example.com','driver','a','Same Name');
  const otherDriver=await account('driver2@example.com','driver','b','Same Name');
  const dispatcher=await account('staff@example.com','dispatcher','a');
  assert.equal((await post('/api/accounts/invitations',{email:'escalate@example.com',role:'admin',companyId:'a'},dispatcher.cookie)).status,403);
  assert.equal((await post('/api/accounts/invitations',{email:'cross@example.com',role:'driver',companyId:'b'},dispatcher.cookie)).status,403);
  for(const actor of [a,b]) {
    assert.equal((await post('/api/operations',{type:'invoice.create',invoice:{customer:actor.user.companyId,amount:100,companyId:'spoofed'}},actor.cookie)).status,201);
    assert.equal((await post('/api/events',{type:'message.send',message:{loadId:'general',text:actor.user.companyId}},actor.cookie)).status,200);
    assert.equal((await post('/api/events',{type:'booking.add',loadId:'LB-48201'},actor.cookie)).status,200);
  }
  assert.equal((await post('/api/operations',{type:'assignment.create',assignment:{loadId:'LB-48201',driverName:'Same Name',driverUserId:otherDriver.user.id,truckId:'T1'}},a.cookie)).status,403);
  assert.equal((await post('/api/operations',{type:'assignment.create',assignment:{loadId:'LB-48201',driverName:'Same Name',driverUserId:driver.user.id,truckId:'T1'}},a.cookie)).status,201);
  for(const actor of [a,b]) {
    const snapshot=await (await get('/api/operations',actor.cookie)).json();
    assert.equal(snapshot.operations.invoices.length,1);
    assert.equal(snapshot.operations.invoices[0].companyId,actor.user.companyId);
    const board=await (await get('/api/app',actor.cookie)).json();
    assert.deepEqual(board.state.messages.map(m=>m.text),[actor.user.companyId]);
  }
  assert.equal((await (await get('/api/operations',driver.cookie)).json()).operations.assignments.length,1);
  assert.equal((await (await get('/api/operations',otherDriver.cookie)).json()).operations.assignments.length,0);
  assert.deepEqual((await (await get('/api/app')).json()).state.messages,[]);
  const abort=new AbortController();
  const stream=await fetch(app.url+'/api/events',{headers:{cookie:b.cookie},signal:abort.signal});
  const reader=stream.body.getReader();
  const initial=new TextDecoder().decode((await reader.read()).value);
  assert.ok(initial.includes('"text":"b"')); assert.ok(!initial.includes('"text":"a"'));
  await post('/api/events',{type:'message.send',message:{loadId:'general',text:'private-a'}},a.cookie);
  const update=new TextDecoder().decode((await reader.read()).value);
  assert.ok(!update.includes('private-a'));
  abort.abort();
  await app.stop(); app=await start(config);
  const restored=await (await get('/api/app',a.cookie)).json();
  assert.deepEqual(restored.state.messages.map(m=>m.text),['a','private-a']);
  assert.equal((await (await get('/api/operations',b.cookie)).json()).operations.invoices.length,1);
});

test('carrier checkout retry survives restart and preserves the fleet onboarding decision', async (t) => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alphaway-checkout-retry-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'store.json'), log=path.join(dir,'calls.json'), preload=path.join(dir,'mock.cjs');
  const billingPath=path.resolve(__dirname,'../billing.js');
  fs.writeFileSync(preload, `const fs=require('node:fs'); require(${JSON.stringify(billingPath)}).createBilling=()=>({checkout:async(plan,email,actor,requestId,options)=>{ const file=${JSON.stringify(log)}; const calls=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[]; calls.push({requestId,options}); fs.writeFileSync(file,JSON.stringify(calls)); if(calls.length===1) throw Object.assign(new Error('Simulated lost Stripe response'),{statusCode:502}); return {url:'https://checkout.stripe.com/c/pay/fixture',sessionId:'cs_fixture'}; }});`);
  const password=crypto.randomBytes(24).toString('hex');
  const config={ALPHAWAY_DATA_FILE:file,ALPHAWAY_ACCOUNT_AUTH:'true',ALPHAWAY_ADMIN_EMAIL:'admin@example.com',ALPHAWAY_ADMIN_PASSWORD:password,NODE_OPTIONS:`--require="${preload.replaceAll('\\','/')}"`};
  let app=await start(config); t.after(()=>app.stop());
  const signin=async()=> (await fetch(`${app.url}/api/accounts/signin`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@example.com',password})})).headers.get('set-cookie').split(';')[0];
  let cookie=await signin();
  const checkout=async(truckCount=3)=>fetch(`${app.url}/api/stripe/checkout`,{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({plan:'carrier',truckCount,requestId:crypto.randomUUID()})});
  assert.equal((await checkout()).status,502);
  const draft=JSON.parse(fs.readFileSync(file)).billingCheckouts[0];
  assert.equal(draft.onboardingRequired,true);
  assert.equal((await checkout(4)).status,409);
  await app.stop(); app=await start(config); cookie=await signin();
  assert.equal((await checkout()).status,200);
  const calls=JSON.parse(fs.readFileSync(log));
  assert.equal(calls.length,2);
  assert.equal(calls[0].requestId,calls[1].requestId);
  assert.deepEqual(calls[0].options,calls[1].options);
  assert.equal(calls[1].options.truckCount,3);
  assert.equal((await checkout()).status,200);
  assert.equal(JSON.parse(fs.readFileSync(log)).length,2);
});
