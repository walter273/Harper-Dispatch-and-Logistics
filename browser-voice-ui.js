(() => {
 const form=document.getElementById('deskCallForm'), callButton=document.getElementById('deskBrowserCall'), hangup=document.getElementById('deskHangup'), status=document.getElementById('deskCallStatus'), ready=document.getElementById('deskVoiceReady');
 if(!form)return;
 let device=null, connection=null, epoch=0, active=false, sdkPromise=null, callTimer=null;
 async function request(url,body){const r=await fetch(url,body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Connection unavailable.');return data;}
 async function refresh(){const version=epoch;try{const data=await request('/api/voice/state');if(version!==epoch)return;ready.textContent=data.ready?'Browser calling connected.':'Browser calling awaits its private Twilio voice credentials and setup.';if(!active)callButton.disabled=!data.ready;const list=document.getElementById('deskCallHistory');list.replaceChildren();for(const row of data.calls){const p=document.createElement('p');p.textContent=new Date(row.createdAt).toLocaleString()+' · '+row.phone+' · '+row.status;list.append(p);}}catch{callButton.disabled=true;ready.textContent='Sign in as administrator or dispatcher to use calls.';}}
 function sdk(){if(window.Twilio?.Device)return Promise.resolve();if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/api/voice/sdk.js';script.onload=resolve;script.onerror=()=>{sdkPromise=null;reject(new Error('The calling tools could not load.'));};document.head.append(script);});return sdkPromise;}
 function cleanup(){clearTimeout(callTimer);callTimer=null;const oldConnection=connection,oldDevice=device;connection=null;device=null;active=false;hangup.disabled=true;oldConnection?.removeAllListeners();oldConnection?.disconnect();oldDevice?.destroy();}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(active||!form.reportValidity())return;active=true;callButton.disabled=true;hangup.disabled=false;const version=epoch;status.textContent='Connecting microphone and call…';
  try{await sdk();const data=await request('/api/voice/token',{phone:form.elements.phone.value});if(version!==epoch||!active)return;device=new Twilio.Device(data.token,{logLevel:1,edge:"ashburn",enableImprovedSignalingErrorPrecision:true});device.on('error',()=>{status.textContent='Call connection failed. Check microphone permission and your connection.';cleanup();refresh();});connection=await device.connect({params:{CallIntent:data.callId}});if(version!==epoch||!active){cleanup();return;}connection.on('accept',()=>{clearTimeout(callTimer);status.textContent='Call connected.';});connection.on('disconnect',()=>{status.textContent='Call ended.';cleanup();refresh();});connection.on('error',()=>{status.textContent='The call could not connect.';cleanup();refresh();});status.textContent='Calling…';callTimer=setTimeout(()=>{if(active&&version===epoch){epoch++;cleanup();status.textContent='Call timed out before connecting. Check your network and try again.';refresh();}},45000);}
  catch(e){if(version===epoch){status.textContent=e.message||'Call failed.';cleanup();refresh();}}
 });
 hangup.addEventListener('click',()=>{epoch++;cleanup();status.textContent='Call ended.';refresh();});
 document.getElementById('deskVoiceSetup')?.addEventListener('click',async()=>{try{await request('/api/voice/setup',{});await refresh();}catch(e){ready.textContent=e.message;}});
 window.addEventListener('alphaway:account-changed',()=>{epoch++;cleanup();form.reset();status.textContent='';document.getElementById('deskCallHistory').replaceChildren();refresh();});
 window.addEventListener('pagehide',cleanup);
 document.getElementById('deskRefresh')?.addEventListener('click',refresh);
 refresh();
})();
