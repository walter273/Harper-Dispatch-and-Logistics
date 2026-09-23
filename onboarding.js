(() => {
  const guestSignIn = document.querySelector('.public-nav-signin[href="/index.html"]');
  if (guestSignIn) {
    guestSignIn.href = '/access.html';
    guestSignIn.textContent = 'Sign in';
  }
  const status = document.getElementById('onboardingStatus'), steps = document.getElementById('onboardingSteps');
  const labels = { approval: 'Application approval', evidence: 'Documents and agreement reviewed', account: 'Account created', dispatcher: 'Dispatcher assigned', payment: 'Payment setup confirmed' };
  async function refresh() {
    steps.replaceChildren();
    try {
      const response = await fetch('/api/onboarding', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw Error('Sign in to your carrier account to see onboarding status.');
      if (!data.onboarding) { status.textContent = 'No automated onboarding record is linked to this account. Contact the Harper team.'; return; }
      status.textContent = `${data.onboarding.company}: ${data.onboarding.ready ? 'Ready for dispatch' : 'Onboarding in progress'}`;
      if (!data.onboarding.steps.payment && data.onboarding.billingMethod === 'weekly' && !data.onboarding.paymentConfigured) {
        const notice = document.createElement('p'); notice.textContent = 'Payment setup is awaiting the Harper team. No payment has been taken.'; steps.append(notice);
      }
      for (const [id, complete] of Object.entries(data.onboarding.steps)) { const p = document.createElement('p'); p.textContent = `${labels[id]} — ${complete ? 'Complete' : 'Pending'}`; steps.append(p); }
    } catch (error) { status.textContent = error.message; }
  }
  document.getElementById('onboardingRefresh').addEventListener('click', refresh);
  window.addEventListener('pagehide', () => { steps.replaceChildren(); status.textContent = ''; });
  refresh();
})();
