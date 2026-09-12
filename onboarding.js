(() => {
  const status = document.getElementById('onboardingStatus'), steps = document.getElementById('onboardingSteps');
  const labels = { approval: 'Application approval', evidence: 'Documents and agreement reviewed', account: 'Account created', dispatcher: 'Dispatcher assigned', payment: 'Payment setup confirmed' };
  async function refresh() {
    steps.replaceChildren();
    try {
      const response = await fetch('/api/onboarding', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw Error('Sign in to your carrier account to see onboarding status.');
      if (!data.onboarding) { status.textContent = 'No automated onboarding record is linked to this account. Contact the AlphaWay team.'; return; }
      status.textContent = `${data.onboarding.company}: ${data.onboarding.ready ? 'Ready for dispatch' : 'Onboarding in progress'}`;
      for (const [id, complete] of Object.entries(data.onboarding.steps)) { const p = document.createElement('p'); p.textContent = `${labels[id]} — ${complete ? 'Complete' : 'Pending'}`; steps.append(p); }
    } catch (error) { status.textContent = error.message; }
  }
  document.getElementById('onboardingRefresh').addEventListener('click', refresh);
  window.addEventListener('pagehide', () => { steps.replaceChildren(); status.textContent = ''; });
  refresh();
})();
