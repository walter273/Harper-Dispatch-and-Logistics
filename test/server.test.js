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
  assert.equal((await fetch(`${app.url}/api/stripe/checkout`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan:'carrier'})})).status,503);
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
  fs.renameSync(file,`${file}.backup`); fs.mkdirSync(file);
  assert.equal((await send({...event,id:'evt_retry'})).status,500);
  fs.rmdirSync(file); fs.renameSync(`${file}.backup`,file);
  assert.equal((await send({...event,id:'evt_retry'})).status,200);
  assert.equal(JSON.parse(fs.readFileSync(file)).operations.billingEvents.length,2);
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
