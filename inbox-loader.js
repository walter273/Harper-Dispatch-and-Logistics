(() => {
 let loaded=false;
 async function load(){if(loaded)return;try{const r=await fetch('/api/inbox/config',{cache:'no-store'});if(!r.ok)return;loaded=true;const s=document.createElement('script');s.src='/api/inbox/ui.js';s.onerror=()=>{loaded=false;};document.body.append(s);}catch{}}
 window.addEventListener('harper:account-changed',load);load();
})();
