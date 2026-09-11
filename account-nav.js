(() => {
  const navs = document.querySelectorAll('header nav');
  if (!navs.length) return;
  let revision = 0;
  const render = (account) => {
    navs.forEach((nav) => {
      [
        { attribute: 'data-admin-nav', allowed: account?.role === 'admin', href: './admin.html', label: 'Admin' },
        { attribute: 'data-intake-nav', allowed: ['admin', 'dispatcher'].includes(account?.role), href: './intake-review.html', label: 'Intake review' }
      ].forEach(item => {
        let link = nav.querySelector(`[${item.attribute}]`);
        if (!item.allowed) { link?.remove(); return; }
        if (!link) {
          link = document.createElement('a');
          link.href = item.href;
          link.textContent = item.label;
          link.setAttribute(item.attribute, '');
          nav.append(link);
        }
      });
    });
  };
  window.addEventListener('alphaway:account-changed', (event) => {
    revision += 1;
    render(event.detail);
  });
  const initialRevision = revision;
  fetch('/api/accounts/me', { credentials: 'same-origin', cache: 'no-store' })
    .then((response) => response.ok ? response.json() : { account: null })
    .then((payload) => { if (revision === initialRevision) render(payload.account); })
    .catch(() => { if (revision === initialRevision) render(null); });
})();
