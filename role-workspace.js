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
