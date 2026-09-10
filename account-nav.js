(() => {
  const navs = document.querySelectorAll('header nav');
  if (!navs.length) return;
  let revision = 0;
  const render = (account) => {
    navs.forEach((nav) => {
      let link = nav.querySelector('[data-admin-nav]');
      if (account?.role !== 'admin') {
        link?.remove();
        return;
      }
      if (!link) {
        link = document.createElement('a');
        link.href = './admin.html';
        link.textContent = 'Admin';
        link.setAttribute('data-admin-nav', '');
        nav.append(link);
      }
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
