const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {start}=require('../test-support/server');const {seed}=require('../test-support/review-fixture');
test('roles restrict direct pages, operational writes, catalog and plan selection',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harper-roles-')),file=path.join(dir,'store.json');const {tokens}=seed(file);const app=await start({HARPER_DATA_FILE:file,HARPER_ACCOUNT_AUTH:'true'});
 t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const request=(url,role,body)=>fetch(app.url+url,{redirect:'manual',method:body?'POST':'GET',headers:{cookie:`harper_account=${tokens['user-'+role]}`,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 for(const role of ['broker','shipper','driver']) for(const page of ['loadboard.html','planning-tools.html','tms.html']) assert.equal((await request('/'+page,role)).status,403);
 for(const role of ['carrier-owner','broker','shipper','driver']) assert.equal((await request('/workspace.html',role)).status,200);
 for(const role of ['broker','shipper']){
  assert.equal((await request('/api/operations',role,{type:'assignment.create',assignment:{loadId:'TEST',driverName:'TEST',truckId:'TEST'}})).status,403);
  assert.equal((await request('/api/events',role,{type:'booking.add',loadId:'TEST'})).status,403);
  assert.deepEqual((await (await request('/api/app',role)).json()).loads,[]);
  assert.equal((await request('/api/fmcsa/brokers?q=123',role)).status,403);
 }
 assert.equal((await request('/api/operations','shipper',{type:'invoice.create',invoice:{customer:'TEST',amount:1}})).status,403);
 assert.equal((await request('/api/billing/checkout','broker',{plan:'shipper'})).status,403);
 assert.equal((await request('/api/billing/checkout','shipper',{plan:'broker'})).status,403);
 assert.equal((await request('/api/operations','carrier-owner',{type:'assignment.create',assignment:{loadId:'TEST',driverName:'TEST',truckId:'TEST'}})).status,201);
 assert.equal((await request('/api/operations','broker',{type:'invoice.create',invoice:{customer:'TEST',amount:1}})).status,201);
 const shipper=await (await request('/api/operations','shipper')).json();assert.deepEqual(shipper.operations.invoices,[]);assert.deepEqual(shipper.operations.assignments,[]);
});
