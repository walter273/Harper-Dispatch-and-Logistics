(() => {
  const button = document.getElementById('billingReviewRefresh');
  const output = document.getElementById('billingReviewResult');
  if (!button || !output) return;
  async function refresh() {
    button.disabled = true;
    output.textContent = 'Checking billing settings…';
    try {
      const response = await fetch('/api/admin/billing-review', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Sign in as an administrator to view this review.' : 'Review unavailable. Please try again.');
      const report = await response.json();
      output.replaceChildren();
      const heading = document.createElement('p');
      heading.textContent = `${report.liveCollectionEnabled ? 'Real charges are enabled.' : 'Real charges are disabled.'} Launch approval is still pending. Checked ${new Date(report.checkedAt).toLocaleString()}. Results are cached for one minute.`;
      output.append(heading);
      const list = document.createElement('ul');
      const labels = { pass: 'PASS', fix: 'NEEDS ATTENTION', unknown: 'NOT VERIFIED', review: 'REVIEW NEEDED' };
      for (const check of report.checks) {
        const item = document.createElement('li');
        item.textContent = `${labels[check.status] || 'NOT VERIFIED'} — ${check.name}: ${check.detail}`;
        list.append(item);
      }
      output.append(list);
    } catch (error) { output.textContent = error.message; }
    finally { button.disabled = false; }
  }
  button.addEventListener('click', refresh);
  refresh();
})();
