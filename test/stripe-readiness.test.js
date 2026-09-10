const { test } = require('node:test');
const assert = require('node:assert/strict');
const { review, configuration, portalParameters } = require('../scripts/stripe-readiness');
const env = { STRIPE_SECRET_KEY: ['sk','test','fixture'].join('_'), STRIPE_MODE:'test', STRIPE_ACCOUNT_ID:'acct_fixture', STRIPE_PUBLIC_BASE_URL:'https://app.example.com' };
function fixture(configs = []) {
  const writes = [];
  return { writes, accounts:{retrieve:async()=>({id:'acct_fixture',charges_enabled:true,payouts_enabled:true})},
    billingPortal:{configurations:{
      list:async function*(){ yield* configs; },
      create:async params=>{ writes.push({create:params}); return {...params,id:'bpc_new',active:true,livemode:false}; },
      update:async(id,params)=>{ writes.push({update:id,params}); return {...params,id,active:true,livemode:false}; }
    }}, tax:{settings:{retrieve:async()=>({status:'active',head_office:{address:{country:'US',state:'CO'}},defaults:{}})},registrations:{list:async()=>({data:[],has_more:false})}} };
}
test('configuration review rejects wrong credentials, account, and unsafe origins before mutation', async()=>{
  for (const changes of [{STRIPE_SECRET_KEY:''},{STRIPE_MODE:'live'},{STRIPE_PUBLIC_BASE_URL:'http://public.example.com'}, {STRIPE_PUBLIC_BASE_URL:'https://secret@example.com'}]) {
    assert.throws(()=>configuration({...env,...changes}));
  }
  const client=fixture();
  client.accounts.retrieve=async()=>({id:'acct_other'});
  await assert.rejects(review(env,{client,configurePortal:true}), /different Stripe account/);
  assert.deepEqual(client.writes,[]);
});
test('read-only review reports missing setup without changing Stripe or claiming a payment test',async()=>{
  const client=fixture(); const result=await review(env,{client});
  assert.deepEqual(client.writes,[]);
  assert.equal(result.portal.configured,false);
  assert.equal(result.tax.legalReviewComplete,false);
  assert.equal(result.endToEndPaymentAndCancellation,'Not verified by this configuration review');
});
test('portal setup reuses only the app-owned origin and never rewrites unrelated configurations',async()=>{
  const params=portalParameters('https://app.example.com');
  const unrelated={id:'bpc_unrelated',livemode:false,metadata:{}};
  const client=fixture([unrelated]); const result=await review(env,{client,configurePortal:true});
  assert.equal(client.writes.length,1); assert.ok(client.writes[0].create);
  assert.equal(result.portal.cancellationEnabled,true);
  assert.equal(result.portal.cancellationMode,'at_period_end');
  assert.equal(result.portal.installedInEnvironment,false);
  const owned={...params,id:'bpc_owned',livemode:false,active:false};
  const retry=fixture([unrelated,owned]);
  await review(env,{client:retry,configurePortal:true});
  assert.equal(retry.writes[0].update,'bpc_owned');
  assert.equal(retry.writes[0].params.active,true);
  assert.equal(retry.writes[0].params.features.subscription_update.enabled,false);
  const duplicates=fixture([owned,{...owned,id:'bpc_duplicate'}]);
  await assert.rejects(review(env,{client:duplicates,configurePortal:true}), /Multiple app-owned/);
  assert.deepEqual(duplicates.writes,[]);
});
