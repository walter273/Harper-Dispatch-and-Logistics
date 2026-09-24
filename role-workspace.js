(() => {
 const permissions=window.HarperPermissions;
 let version=0;
 let recordsOwner = null;
 function render(account){
  const role=account?.role;
  const records=document.getElementById('companyRecords');
  if(records){
   records.hidden=!account; const list=document.getElementById('companyRecordsList');
   if(recordsOwner!==account?.id){recordsOwner=account?.id;list.replaceChildren();
    if(account){const owner=account.id; document.getElementById('companyRecordsStatus').textContent='Loading your records…';
     fetch('/api/operations',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load records.');return data;}).then(data=>{
      if(recordsOwner!==owner)return;document.getElementById('companyRecordsStatus').textContent='Only records permitted for your account are shown.';
      for(const [key,title] of [['assignments','Shipment assignments'],['documents','Documents'],['invoices','Invoices']]){
       if(role==='driver'&&key==='invoices')continue;
       const section=document.createElement('section'),h=document.createElement('h3');h.textContent=title;section.append(h);
       const rows=data.operations?.[key]||[];
       if(!rows.length){const p=document.createElement('p');p.textContent='No records available.';section.append(p);}
       rows.forEach(row=>{const p=document.createElement('p');p.textContent=[row.loadId,row.fileName||row.customer||row.driverName,row.status].filter(Boolean).join(' · ');section.append(p);});list.append(section);
      }
     }).catch(e=>{if(recordsOwner===owner)document.getElementById('companyRecordsStatus').textContent=e.message;});
    }
   }
  }

  document.querySelectorAll('[data-feature]').forEach(el=>{el.hidden=!permissions.allowed(role,el.dataset.feature);});
  document.querySelectorAll('a[href]').forEach(link=>{
   const page=new URL(link.href,location.href).pathname.split('/').pop();
   const feature=permissions.pages[page]||({'carrier-onboarding.html':'carrier','onboarding.html':'carrier','broker-intake.html':'broker'})[page]; if(feature)link.hidden=!permissions.allowed(role,feature);
  });
  document.querySelectorAll('[data-workspace-plan]').forEach(el=>el.hidden=!permissions.planAllowed(role,el.dataset.workspacePlan));
  const form=document.getElementById('dispatchPlanForm');if(form)form.hidden=!permissions.allowed(role,'carrier');
  const title=document.getElementById('workspaceHeading');
  if(title)title.textContent=({'carrier-owner':'Your carrier workspace',driver:'Your assigned work',broker:'Your broker workspace',shipper:'Your shipper workspace',dispatcher:'Your dispatch workspace',admin:'Your administration workspace'})[role]||'Your workspace';
  const intro=document.getElementById('workspaceIntro');if(intro)intro.textContent='Tools for your role, with records limited to your company and permitted assignments. Features remain subject to your approved service and plan.';
 }
 window.addEventListener('harper:account-changed',e=>{version++;render(e.detail);});
 const initial=version;
 fetch('/api/accounts/me',{cache:'no-store'}).then(r=>r.ok?r.json():{}).then(p=>{if(initial===version)render(p.account);}).catch(()=>render(null));
 render(null);
})();

// Communications are restricted to signed-in staff on the server.
(() => {
 const emailForm=document.getElementById('deskEmailForm');
 const status=document.getElementById('deskEmailStatus');
 let pending=null, generation=0;
 const labels={sending:'Sending',accepted:'Accepted by Twilio; delivery pending',delivered:'Delivered to recipient mail server',rejected:'Rejected by provider',uncertain:'Delivery uncertain: check Twilio before sending again',delivery_failed:'Delivery failed'};
 async function refresh(){
  const version=generation;
  try{const r=await fetch('/api/communications',{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error);if(version!==generation)return;
   const history=document.getElementById('deskEmailHistory');history.replaceChildren();
   if(!data.messages.length)history.textContent='No workspace emails sent yet.';
   for(const row of data.messages){const p=document.createElement('p');p.textContent=new Date(row.createdAt).toLocaleString()+' · '+row.from+' → '+row.to+' · '+row.subject+' · '+(labels[row.status]||row.status)+(row.providerStatus?' (provider '+row.providerStatus+(row.providerCode?', code '+row.providerCode:'')+')':'');history.append(p);}
  }catch(e){if(version===generation)document.getElementById('deskEmailHistory').textContent='Sign in as administrator or dispatcher to view sent email.';}
 }
 emailForm?.addEventListener('submit',async event=>{
  event.preventDefault();if(!emailForm.reportValidity())return;
  const body=Object.fromEntries(new FormData(emailForm));
  const fingerprint=JSON.stringify(body);if(pending&&pending.fingerprint!==fingerprint){status.textContent='The previous request has an uncertain result. Refresh delivery status before starting a new message.';return;}
  pending ||= {fingerprint,id:crypto.randomUUID()};body.requestId=pending.id;
  const button=emailForm.querySelector('button');button.disabled=true;const version=generation;status.textContent='Sending…';
  try{const r=await fetch('/api/communications/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error||'Unable to send.');if(version!==generation)return;
   status.textContent=labels[data.message.status]||data.message.status;
   pending=null;emailForm.reset();await refresh();
  }catch(e){if(version===generation)status.textContent=e.message+' Retry the unchanged message to check the same send reference; it will not be sent twice.';}
  finally{button.disabled=false;}
 });
 document.getElementById('deskRefresh')?.addEventListener('click',refresh);
 window.addEventListener('harper:account-changed',()=>{generation++;pending=null;emailForm?.reset();status.textContent='';document.getElementById('deskEmailHistory').replaceChildren();refresh();});
 refresh();
})();
