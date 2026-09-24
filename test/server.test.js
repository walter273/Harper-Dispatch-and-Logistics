const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

async function start(extra = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(HARPER_|HARPER_|SQUARE_|NODE_ENV$|PORT$|HOST$)/.test(key)));
  const child = spawn(process.execPath, ['--max-old-space-size=128', 'server.js'], { cwd: path.resolve(__dirname,'..'), env: {...env, PORT:'0', HARPER_HOST:'127.0.0.1', ...extra}, windowsHide: true });
  let output = '', errors = '';
  const url = await new Promise((resolve,reject) => {
    const startupTimeout = Math.min(180000, Math.max(45000, Number(process.env.HARPER_TEST_STARTUP_TIMEOUT_MS) || 45000));
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Server startup timed out: ${errors || output}`)); },startupTimeout);
    child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
    child.stderr.on('data', chunk => { errors += chunk; });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`Server exited before ready: ${errors}`)); });
  });
  return { url, async stop() { if (child.exitCode !== null) return; const done = once(child,'exit'); child.kill(); await done; } };
}

test('account auth protects intakes and catalog even without preview basic auth', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alphaway-access-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const password = crypto.randomBytes(24).toString('hex');
  const app = await start({ HARPER_DATA_FILE: path.join(dir, 'store.json'), HARPER_ACCOUNT_AUTH: 'true', HARPER_ADMIN_EMAIL: 'admin@example.com', HARPER_ADMIN_PASSWORD: password, RAILWAY_ENVIRONMENT_ID: 'test-environment' });
  t.after(() => app.stop());
  const post = (route, body, cookie = '') => fetch(app.url + route, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
  assert.equal((await fetch(app.url + '/api/intakes')).status, 403);
  assert.equal((await post('/api/events', { type: 'catalog.reset', baseRevision: 0 })).status, 401);
  const signin = await post('/api/accounts/signin', { email: 'admin@example.com', password });
  assert.equal(signin.status, 200);
  const issued = signin.headers.get('set-cookie');
  // A plain-HTTP request must NOT be given a Secure cookie: the browser would
  // refuse it and the session would be silently dropped on the next navigation.
  assert.doesNotMatch(issued, /; Secure/);
  // SameSite must be Lax, not Strict, or the cookie is withheld on the redirect
  // that follows sign-in and the visitor bounces straight back to the form.
  assert.match(issued, /SameSite=Lax/);
  const cookie = issued.split(';')[0];
  assert.equal((await fetch(app.url + '/api/intakes', { headers: { cookie } })).status, 200);
  // Behind a TLS-terminating proxy the visitor is on HTTPS, so Secure is set.
  const viaProxy = await fetch(app.url + '/api/accounts/signin', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' }, body: JSON.stringify({ email: 'admin@example.com', password }) });
  assert.match(viaProxy.headers.get('set-cookie'), /; Secure/);
  const snapshot = await (await fetch(app.url + '/api/app')).json();
  assert.equal((await post('/api/events', { type: 'catalog.reset', baseRevision: snapshot.revision }, cookie)).status, 200);
});


test('company boundaries apply to HTTP snapshots, stream updates, invitations and restart', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'alphaway-tenants-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'store.json'), password=crypto.randomBytes(24).toString('hex');
  const config={HARPER_DATA_FILE:file,HARPER_ACCOUNT_AUTH:'true',HARPER_ADMIN_EMAIL:'admin@example.com',HARPER_ADMIN_PASSWORD:password};
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
  const a=await account('shipper@example.com','carrier-owner','a');
  const b=await account('broker@example.com','carrier-owner','b');
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


