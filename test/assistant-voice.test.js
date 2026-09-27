const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAssistantVoice,DAILY_TURN_BUDGET,MAX_TURNS_KEPT}=require('../assistant-voice');

const key='sk-test-0000000000000000000000000000';
const audio=Buffer.from('fake-webm-bytes').toString('base64');

// A fake provider: records what it was asked, and answers in the shapes the
// real endpoints return. Lets us assert the full turn without a network call.
function fakeFetch(calls,{transcript='What loads are open today?',reply='Two loads are open on the Denver lane.'}={}){
  return async (url,options={})=>{
    const target=String(url);
    if(target.endsWith('/audio/transcriptions')){
      calls.transcribe++;
      return{ok:true,status:200,json:async()=>({text:transcript})};
    }
    if(target.endsWith('/audio/speech')){
      calls.speak++;
      calls.spokenInput=JSON.parse(options.body).input;
      // Return an exact ArrayBuffer copy: Buffer.buffer exposes the whole shared
      // pool, which would not match the synthesized bytes.
      const bytes=Buffer.from('MP3-AUDIO');
      return{ok:true,status:200,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
    }
    if(target.includes('/chat/completions')){
      calls.chat++;
      calls.messages.push(JSON.parse(options.body).messages);
      return{ok:true,status:200,json:async()=>({choices:[{message:{content:reply}}]})};
    }
    throw new Error(`unexpected provider call: ${target}`);
  };
}
function makeStore(){return{assistantVoice:{conversations:[],budgets:[]}};}
function harness(env={},fetchImpl){
  const store=makeStore();
  const calls={chat:0,speak:0,transcribe:0,messages:[]};
  const voice=createAssistantVoice({
    env:{OPENAI_API_KEY:key,...env},
    fetchImpl:fetchImpl||fakeFetch(calls),
    getStore:()=>store,
    persist:()=>{},
  });
  return{voice,calls,store};
}
const dispatcher={id:'d1',role:'dispatcher',companyId:'harper'};

test('assistant voice fails closed when the provider key is absent',async()=>{
  const store=makeStore();
  const voice=createAssistantVoice({env:{},fetchImpl:async()=>{throw new Error('must not be called')},getStore:()=>store,persist:()=>{}});
  assert.equal(voice.configured(),false);
  assert.equal(voice.state(dispatcher).configured,false);
  const opened=voice.open(dispatcher);
  await assert.rejects(()=>voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio}),/not configured/i);
});

test('a spoken turn transcribes, answers with context, and speaks back',async()=>{
  const{voice,calls,store}=harness();
  const opened=voice.open(dispatcher);
  const first=await voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio});
  assert.equal(first.transcript,'What loads are open today?');
  assert.equal(first.reply,'Two loads are open on the Denver lane.');
  assert.equal(first.contentType,'audio/mpeg');
  assert.equal(Buffer.from(first.audio,'base64').toString(),'MP3-AUDIO');
  assert.equal(calls.transcribe,1);
  assert.equal(calls.speak,1);
  // The reply spoken aloud is exactly the reply returned to the page.
  assert.equal(calls.spokenInput,first.reply);
  // The system prompt must forbid inventing operational facts.
  const system=calls.messages[0][0].content;
  assert.match(system,/Never invent current plans, prices, availability/);
  assert.match(system,/short and speakable/);
  // The turn is persisted for follow-up context, capped.
  const entry=store.assistantVoice.conversations.find(e=>e.id===opened.conversationId);
  assert.equal(entry.turns.length,2);
  assert.equal(entry.turns[0].content,'What loads are open today?');
});

test('follow-up turns carry the conversation so context works',async()=>{
  const{voice,calls}=harness();
  const opened=voice.open(dispatcher);
  await voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio});
  await voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio});
  // The second call must include the first exchange as context.
  const second=calls.messages[1];
  const roles=second.map(m=>m.role);
  assert.deepEqual(roles,['system','user','assistant','user']);
  assert.equal(second[1].content,'What loads are open today?');
  assert.equal(second[2].content,'Two loads are open on the Denver lane.');
});

test('a conversation cannot be continued by another company',async()=>{
  const{voice}=harness();
  const opened=voice.open(dispatcher);
  const intruder={id:'x1',role:'dispatcher',companyId:'other-co'};
  await assert.rejects(()=>voice.turn(intruder,{conversationId:opened.conversationId,audioBase64:audio}),/no longer available/i);
  assert.equal(voice.close(intruder,opened.conversationId).closed,false);
});

test('a turn costs budget and the daily cap eventually refuses',async()=>{
  const{voice}=harness();
  const opened=voice.open(dispatcher);
  for(let i=1;i<=DAILY_TURN_BUDGET;i++){
    await voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio});
  }
  assert.equal(voice.state(dispatcher).budget.used,DAILY_TURN_BUDGET);
  // Over budget: refused before any audio is sent upstream, so it costs nothing.
  await assert.rejects(()=>voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio}),/daily assistant voice allowance/i);
});

test('a refused budget does not bill the provider',async()=>{
  const{voice,calls}=harness();
  const opened=voice.open(dispatcher);
  for(let i=0;i<DAILY_TURN_BUDGET;i++) await voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio});
  const before={...calls};
  await assert.rejects(()=>voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio}));
  assert.equal(calls.transcribe,before.transcribe);
  assert.equal(calls.chat,before.chat);
  assert.equal(calls.speak,before.speak);
});

test('oversize audio is refused before transcription',async()=>{
  const{voice,calls}=harness();
  const opened=voice.open(dispatcher);
  const huge=Buffer.alloc(13*1024*1024).toString('base64');
  await assert.rejects(()=>voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:huge}),/too long/i);
  assert.equal(calls.transcribe,0);
});

test('empty audio is refused',async()=>{
  const{voice}=harness();
  const opened=voice.open(dispatcher);
  await assert.rejects(()=>voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:''}),/No audio/i);
});

test('provider failures surface as generic errors, never raw provider detail',async()=>{
  for(const failure of [
    async()=>({ok:false,status:500,json:async()=>({error:{message:'Incorrect API key provided: sk-test-0000'}})}),
    async()=>{throw new Error('connect ECONNREFUSED 10.0.0.5:443')},
  ]){
    const{voice}=harness({},failure);
    const opened=voice.open(dispatcher);
    const error=await voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio}).then(()=>null,e=>e);
    assert.equal(error.statusCode,502);
    assert.doesNotMatch(error.message,/API key|ECONNREFUSED|10\.0\.0\.5/);
  }
});

test('a provider that says nothing is an error, not a silent turn',async()=>{
  const{voice}=harness({},async url=>String(url).endsWith('/audio/transcriptions')
    ?{ok:true,status:200,json:async()=>({text:'   '})}
    :{ok:true,status:200,json:async()=>({choices:[{message:{content:''}}]})});
  const opened=voice.open(dispatcher);
  await assert.rejects(()=>voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio}),/Nothing was recognized/i);
});

test('turn history is capped so the prompt cannot grow without bound',async()=>{
  const{voice,store}=harness();
  const opened=voice.open(dispatcher);
  for(let i=0;i<MAX_TURNS_KEPT+3;i++) await voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio});
  const entry=store.assistantVoice.conversations.find(e=>e.id===opened.conversationId);
  assert.ok(entry.turns.length<=MAX_TURNS_KEPT*2);
});

test('closing a conversation discards its transcript',async()=>{
  const{voice,store}=harness();
  const opened=voice.open(dispatcher);
  await voice.turn(dispatcher,{conversationId:opened.conversationId,audioBase64:audio});
  assert.ok(store.assistantVoice.conversations.find(e=>e.id===opened.conversationId).turns.length>0);
  assert.equal(voice.close(dispatcher,opened.conversationId).closed,true);
  assert.equal(store.assistantVoice.conversations.find(e=>e.id===opened.conversationId).turns.length,0);
});

test('an unknown conversation id is refused',async()=>{
  const{voice}=harness();
  await assert.rejects(()=>voice.turn(dispatcher,{conversationId:'av-nope',audioBase64:audio}),/no longer available/i);
});

test('budget is per company, not global',async()=>{
  const{voice}=harness();
  voice.open(dispatcher);
  const other={id:'x1',role:'dispatcher',companyId:'other-co'};
  voice.open(other);
  assert.equal(voice.state(dispatcher).budget.used,0);
  assert.equal(voice.state(other).budget.used,0);
});
