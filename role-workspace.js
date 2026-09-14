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
 window.addEventListener('alphaway:account-changed',e=>{version++;render(e.detail);});
 const initial=version;
 fetch('/api/accounts/me',{cache:'no-store'}).then(r=>r.ok?r.json():{}).then(p=>{if(initial===version)render(p.account);}).catch(()=>render(null));
 render(null);
})();

// These handoffs never claim to send email or place a browser call.
(() => {
 const emailForm=document.getElementById('deskEmailForm');
 emailForm?.addEventListener('submit',event=>{
  event.preventDefault();
  const recipient=emailForm.elements.recipient.value.trim();
  if(/[\r\n]/.test(recipient)||!emailForm.reportValidity())return;
  const subject=emailForm.elements.subject.value.replace(/[\r\n]+/g,' ').trim();
  const message=emailForm.elements.message.value;
  document.getElementById('deskEmailStatus').textContent='Draft requested in your email app. Nothing has been sent by Harper. If no app opens, configure a default email app on your device.';
  location.href='mailto:'+encodeURIComponent(recipient)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(message);
 });
 const callForm=document.getElementById('deskCallForm');
 callForm?.addEventListener('submit',event=>{
  event.preventDefault();
  const raw=callForm.elements.phone.value.trim();
  const phone=raw.replace(/[ ().-]/g,'');
  const status=document.getElementById('deskCallStatus');
  if(!/^\+?[0-9]{7,15}$/.test(phone)){status.textContent='Enter a phone number with 7 to 15 digits, optionally starting with +.';return;}
  status.textContent='Phone app requested. Confirm the number and caller ID there. Harper has not placed or recorded a call.';
  location.href='tel:'+phone;
 });
})();
