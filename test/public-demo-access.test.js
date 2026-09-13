const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {start}=require('../test-support/server');
const {seed}=require('../test-support/review-fixture');
test('public demos are independent and working pages require active accounts', async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harper-public-'));
 const file=path.join(dir,'store.json'); const {tokens}=seed(file);
 const app=await start({ALPHAWAY_DATA_FILE:file,ALPHAWAY_ACCOUNT_AUTH:'true'});
 t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const get=(route,role)=>fetch(app.url+route,{redirect:'manual',headers:role?{cookie:`alphaway_account=${tokens['user-'+role]}`}:{}});
 for(const name of fs.readdirSync(path.join(__dirname,'..')).filter(n=>n.startsWith('demo-')&&n.endsWith('.html'))){
  const response=await get('/'+name);assert.equal(response.status,200);
  const html=await response.text();assert.match(html,/SAMPLE CONTENT ONLY/);assert.match(html,/Sign up \/ request access/);assert.doesNotMatch(html,/script\.js|operations\.js|\/api\//);
 }
 for(const page of ['workspace.html','loadboard.html','planning-tools.html','tms.html','admin.html','intake-review.html','square-billing.html']){
  for(const role of [undefined,'suspended']){const r=await get('/'+page,role);assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/access.html?next='+page);}
  assert.equal((await get('/'+page,'admin')).status,200);
 }
 assert.equal((await get('/admin.html','carrier-owner')).status,403);
 assert.equal((await get('/intake-review.html','broker')).status,403);
 assert.equal((await get('/intake-review.html','dispatcher')).status,200);
 assert.equal((await get('/%6coadboard.html')).status,302);
 for(const p of ['/access.html','/public-access.js','/public-preview.css','/carrier-onboarding.html','/broker-intake.html','/contact-portal.html','/accept-invitation.html']) assert.equal((await get(p)).status,200);
 const home=await (await get('/')).text();assert.doesNotMatch(home,/href="\.\/(?:loadboard|workspace|planning-tools)\.html"/);assert.doesNotMatch(home,/account-nav\.js/);
});
