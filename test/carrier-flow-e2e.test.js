const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {start}=require('../test-support/server');

// Seed one company containing a dispatcher and a driver, so the assignment
// path is exercised inside a single tenant as it works in production.
function seedCompany(file){
  const {randomBytes,createHash}=require('node:crypto');
  const users=[
    {id:'u-dispatcher',name:'Dana Dispatch',email:'dispatcher@example.com',role:'dispatcher',status:'active',companyId:'harper'},
    {id:'u-driver',name:'Casey Morgan',email:'driver@example.com',role:'driver',status:'active',companyId:'harper'},
    {id:'u-outsider',name:'Blake Broker',email:'broker@example.com',role:'broker',status:'active',companyId:'other-co'}
  ];
  const tokens=Object.fromEntries(users.map(u=>[u.id,randomBytes(32).toString('hex')]));
  const store={schemaVersion:2,revision:1,loads:[],operations:{},accounts:{
    users,companies:[{id:'harper',name:'Harper Dispatch and Logistics',status:'active'},{id:'other-co',name:'Other Company',status:'active'}],
    sessions:users.map(u=>({userId:u.id,tokenHash:createHash('sha256').update(tokens[u.id]).digest('hex'),expiresAt:Date.now()+3600000}))},intakes:[]};
  fs.writeFileSync(file,JSON.stringify(store),{mode:0o600});
  return tokens;
}

// End-to-end carrier flow against a real server process:
// create a load -> assign a driver -> update the load -> close it out.
// Also asserts the canonical apex->www redirect and role isolation.
test('carrier flow: create, assign, update, close',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harper-flow-'));
  const file=path.join(dir,'store.json');
  const seeded=seedCompany(file);
  assert.ok(seeded&&seeded['u-dispatcher'],'seed produced dispatcher token');
  const tokens=seeded;
  const app=await start({HARPER_DATA_FILE:file,HARPER_ACCOUNT_AUTH:'true'});
  t.after(async()=>{await app.stop();fs.rmSync(dir,{recursive:true,force:true});});
  const get=(route,cookie)=>fetch(app.url+route,{redirect:'manual',headers:cookie?{cookie}:{}});
  const post=(route,body,cookie)=>fetch(app.url+route,{method:'POST',headers:{'content-type':'application/json',origin:app.url,...(cookie?{cookie}:{})},body:JSON.stringify(body)});
  const dispatcher=`harper_account=${tokens['u-dispatcher']}`;
  const driver=`harper_account=${tokens['u-driver']}`;
  const broker=`harper_account=${tokens['u-outsider']}`;

  assert.equal((await get('/api/health')).status,200,'health endpoint responds');

  // canonical host: apex redirects permanently to www
  const apex=await fetch(app.url+'/',{headers:{'x-forwarded-host':'harperloadboard.com'},redirect:'manual'});
  assert.equal(apex.status,308,'apex domain redirects permanently to www');
  assert.equal(apex.headers.get('location'),'https://www.harperloadboard.com/');
  const www=await fetch(app.url+'/',{headers:{'x-forwarded-host':'www.harperloadboard.com'},redirect:'manual'});
  assert.equal(www.status,200,'www host is served without redirect');

  // create a load in the catalog
  const baseRevision=(await (await get('/api/app',dispatcher)).json()).revision;
  const load={id:'FLOW-001',origin:'Denver, CO',destination:'Phoenix, AZ',equipment:'Dry Van',miles:863,rate:2450,pickup:'2026-10-02',delivery:'2026-10-04',weight:'42000 lbs',broker:'Flow Brokers LLC',status:'Available'};
  const created=await post('/api/events',{type:'catalog.replace',baseRevision,loads:[load]},dispatcher);
  assert.equal(created.status,200,`load created (${created.status}: ${await created.clone().text()})`);
  assert.ok((await (await get('/api/app',dispatcher)).json()).loads.some(l=>l.id==='FLOW-001'),'load appears in the catalog');

  // assign a driver
  const assigned=await post('/api/operations',{type:'assignment.create',assignment:{loadId:'FLOW-001',driverName:'Casey Morgan',driverUserId:'u-driver',truckId:'TRK-777',status:'Dispatched'}},dispatcher);
  assert.equal(assigned.status,201,`driver assigned (${assigned.status}: ${await assigned.clone().text()})`);
  const flow=(await (await get('/api/operations',dispatcher)).json()).operations.assignments.find(a=>a.loadId==='FLOW-001');
  assert.ok(flow,'assignment is stored');
  assert.equal(flow.truckId,'TRK-777');
  assert.equal(flow.status,'Dispatched');

  // role scoping: the assigned driver sees it, another company does not
  assert.ok((await (await get('/api/operations',driver)).json()).operations.assignments.some(a=>a.loadId==='FLOW-001'),'assigned driver can see the load');
  assert.ok(!(await (await get('/api/operations',broker)).json()).operations.assignments.some(a=>a.loadId==='FLOW-001'),'other-company role cannot see the assignment');

  // a driver from another company cannot be assigned
  const badAssign=await post('/api/operations',{type:'assignment.create',assignment:{loadId:'FLOW-001',driverName:'Blake Broker',driverUserId:'u-outsider',truckId:'TRK-778'}},dispatcher);
  assert.equal(badAssign.status,403,'a driver from another company is refused');

  // close the load out: mark Booked
  const stateNow=await (await get('/api/app',dispatcher)).json();
  const closed=await post('/api/events',{type:'catalog.replace',baseRevision:stateNow.revision,loads:[{...load,status:'Booked'}]},dispatcher);
  assert.equal(closed.status,200,'load updated to Booked');

  // stale revision is rejected
  const stale=await post('/api/events',{type:'catalog.replace',baseRevision,loads:[{...load,rate:1}]},dispatcher);
  assert.equal(stale.status,409,'stale catalog revision is rejected');

  // unauthenticated writes are refused
  const anon=await post('/api/operations',{type:'assignment.create',assignment:{loadId:'FLOW-001',driverName:'X',truckId:'Y'}});
  assert.ok([401,403].includes(anon.status),`anonymous assignment refused (${anon.status})`);

  // broker role cannot mutate the board
  const brokerWrite=await post('/api/events',{type:'catalog.replace',baseRevision,loads:[load]},broker);
  assert.equal(brokerWrite.status,403,'broker role cannot replace the catalog');

  // persistence: the flow survives on disk
  const snapshot=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.ok(snapshot.operations.assignments.some(a=>a.loadId==='FLOW-001'),'assignment persisted');
  assert.equal(snapshot.loads.find(l=>l.id==='FLOW-001').status,'Booked','closed load persisted as Booked');
});
