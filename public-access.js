(() => {
const destinations = new Set(['workspace.html','loadboard.html','planning-tools.html','tms.html','admin.html','intake-review.html','square-billing.html']);
const requested = new URLSearchParams(location.search).get('next');
const next = destinations.has(requested) ? requested : 'workspace.html';
document.getElementById('publicSignin').addEventListener('submit', async event => {
 event.preventDefault(); const form=event.currentTarget, button=form.querySelector('button'), status=document.getElementById('accessStatus'); button.disabled=true; status.textContent='Signing in…';
 try { const response=await fetch('/api/accounts/signin',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(Object.fromEntries(new FormData(form)))}); const data=await response.json(); if(!response.ok) throw new Error(data.error || 'Unable to sign in.'); const sessionResponse=await fetch('/api/accounts/me',{credentials:'same-origin',cache:'no-store'}); const session=await sessionResponse.json(); if(!sessionResponse.ok || !session.account || session.account.id!==data.account.id) throw new Error('Your password was accepted, but we could not confirm your sign-in session. Allow cookies for this website, then try again.'); location.assign('/'+next); } catch(error){status.textContent=error.message;button.disabled=false;}
});
document.getElementById('publicInvitation').addEventListener('submit', async event => {
 event.preventDefault(); const status=document.getElementById('invitationStatus'); let token=new FormData(event.currentTarget).get('invitation').trim();
 try { if(token.includes('://')) {const url=new URL(token); if(url.origin!==location.origin || url.pathname!=='/accept-invitation.html') throw new Error('Use your Harper personal invitation link.'); token=new URLSearchParams(url.hash.slice(1)).get('token') || '';}
 const response=await fetch('/api/accounts/invitations/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}); const data=await response.json(); if(!response.ok) throw new Error(data.error || 'Invalid invitation.'); location.assign('/accept-invitation.html#token='+encodeURIComponent(token)); }catch(error){status.textContent=error.message;}
});
})();