'use strict';

(() => {
  const ASSET_ROOT = document.head?.querySelector('meta[name="harper-assistant-root"]')?.content || '.';
  const stylesheetId = 'harper-assistant-stylesheet';

  if (!document.getElementById(stylesheetId)) {
    const stylesheet = document.createElement('link');
    stylesheet.id = stylesheetId;
    stylesheet.rel = 'stylesheet';
    stylesheet.href = `${ASSET_ROOT}/harper-assistant.css`;
    document.head.append(stylesheet);
  }

  if (!document.getElementById('harper-assistant-launcher')) {
    const root = document.createElement('div');
    root.id = 'harper-assistant-root';
    root.innerHTML = `
      <button class="harper-assistant-launcher" id="harper-assistant-launcher" type="button" aria-expanded="false" aria-controls="harper-assistant-panel">
        <span class="harper-assistant-launcher-icon" aria-hidden="true">H</span>
        <span>Ask Harper</span>
      </button>
      <section class="harper-assistant-panel" id="harper-assistant-panel" aria-label="Harper assistant" hidden>
        <header class="harper-assistant-header">
          <div><strong>Harper Assistant</strong><small>How can we help?</small></div>
          <button class="harper-assistant-close" type="button" data-assistant-close aria-label="Close assistant">×</button>
        </header>
        <div class="harper-assistant-messages" id="harper-assistant-messages" role="log" aria-live="polite"></div>
        <form class="harper-assistant-form" id="harper-assistant-form">
          <input id="harper-assistant-input" type="text" placeholder="Type your message..." autocomplete="off" aria-label="Message" maxlength="500" required>
          <button type="submit">Send</button>
        </form>
      </section>`;
    document.body.append(root);
  }

  const launcher = document.getElementById('harper-assistant-launcher');
  const panel = document.getElementById('harper-assistant-panel');
  const form = document.getElementById('harper-assistant-form');
  const input = document.getElementById('harper-assistant-input');
  const messages = document.getElementById('harper-assistant-messages');
  const closeButton = document.querySelector('[data-assistant-close]');
  if (!launcher || !panel || !form || !input || !messages || !closeButton) return;

  const pages = [
    { href: '/', terms: ['home', 'overview', 'services'], text: 'Start with the homepage to review Harper services, company information, and main navigation.' },
    { href: '/product-load-board.html', terms: ['load board', 'loads', 'freight', 'find loads', 'search freight'], text: 'The Load Board page explains freight search, load details, and the carrier booking experience.' },
    { href: '/solutions-carriers.html', terms: ['carrier', 'owner operator', 'trucker', 'small fleet'], text: 'The carriers page explains dispatch, load booking, documentation, and carrier onboarding.' },
    { href: '/carrier-onboarding.html', terms: ['apply', 'onboard', 'start service', 'request service', 'carrier application'], text: 'Carrier onboarding is where you submit company, contact, insurance, W-9, agreement, and service information for human review.' },
    { href: '/carrier-agreement.html', terms: ['agreement', 'carrier terms', 'dispatch fee', '5%', 'billing terms'], text: 'The carrier agreement explains the dispatch process, 5% collected-revenue fee, payment timing, exclusions, and human approval safeguards.' },
    { href: '/solutions-brokers.html', terms: ['broker', 'freight broker'], text: 'The brokers page explains account access, communication, and broker workflow options.' },
    { href: '/product-broker-desk.html', terms: ['broker desk', 'broker workspace'], text: 'Broker Desk is the broker workspace product page.' },
    { href: '/solutions-shippers.html', terms: ['shipper', 'shipping company'], text: 'The shippers page explains posting freight, coordinating capacity, and tracking delivery.' },
    { href: '/product-shipper-control.html', terms: ['shipper control', 'shipper workspace'], text: 'Shipper Control is the shipper workspace product page.' },
    { href: '/product-dispatch.html', terms: ['dispatch', 'dispatcher', 'freight coordination'], text: 'The dispatch services page explains rate negotiation, broker communication, route planning, and paperwork support.' },
    { href: '/product-planning.html', terms: ['route', 'trip planning', 'plan route', 'miles'], text: 'The planning tools page explains route, fuel, toll, and trip planning features.' },
    { href: '/plans-and-pricing.html', terms: ['price', 'pricing', 'cost', 'fees', 'how much'], text: 'Plans and pricing explains carrier dispatch fees and broker or shipper plans.' },
    { href: '/access.html', terms: ['sign in', 'login', 'log in', 'member access'], text: 'Sign in at Member Access. Your role determines which workspace and tools open.' },
    { href: '/workspace-tour.html', terms: ['workspace', 'command center', 'demo'], text: 'The workspace tour previews the Harper command center without signing in.' },
    { href: '/contact-general.html', terms: ['contact', 'email', 'question', 'general inquiry'], text: 'Use General Inquiries to contact Harper by email or find support information.' },
    { href: '/contact-phone.html', terms: ['call', 'phone', 'speak'], text: 'Call Harper at (720) 522-6523.' },
    { href: '/support-dispatch.html', terms: ['dispatch support', 'load help', 'booking help'], text: 'Dispatch Support provides help for load coordination and dispatch questions.' },
    { href: '/support-billing.html', terms: ['billing help', 'invoice', 'payment support', 'dispatch fee'], text: 'Billing Support explains where to review the dispatch fee, collected revenue, invoices, and payment questions.' },
  ];

  async function askWebsiteAssistant(question) {
    const response = await fetch('/api/assistant', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The website AI assistant is temporarily unavailable.');
    return String(payload.answer || '').trim();
  }

  function addMessage(role, text) {
    const item = document.createElement('div');
    item.className = `harper-assistant-message ${role}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  function answer(question) {
    const q = question.trim().toLowerCase();
    if (!q) return 'Tell me what you need to find, book, or understand.';
    if (/\b(admin|intake review|approval|approve|reject|assistant review)\b/.test(q)) {
      return 'Admin and intake-review tools are available only to signed-in staff. Sign in through Member Access; the Harper assistant can prepare a review draft, but an administrator must make and record the final decision.';
    }
    const match = pages.find(page => page.terms.some(term => q.includes(term)));
    if (match) return `${match.text} Open ${match.href}.`;
    return 'I could not find a confident match. Try asking about a carrier, broker, shipper, load board, dispatch service, planning, pricing, billing, onboarding, contact, or sign-in.';
  }

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
  }

  launcher.addEventListener('click', () => setOpen(panel.hidden));
  closeButton.addEventListener('click', () => {
    setOpen(false);
    launcher.focus();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) setOpen(false); });

  addMessage('assistant', 'Hi! I’m Harper’s assistant. Ask me about loads, onboarding, dispatch, planning, billing, or where to find a workspace.');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = input.value;
    if (!question.trim() || form.dataset.busy === 'true') return;
    form.dataset.busy = 'true';
    input.disabled = true;
    form.querySelector('button').disabled = true;
    addMessage('visitor', question);
    input.value = '';
    addMessage('assistant', 'Thinking…');
    const pending = messages.lastElementChild;
    try {
      const result = await askWebsiteAssistant(question);
      pending.textContent = result || answer(question);
    } catch (error) {
      pending.textContent = `${error.message} ${answer(question)}`.trim();
    } finally {
      form.dataset.busy = 'false';
      input.disabled = false;
      form.querySelector('button').disabled = false;
      input.focus();
    }
  });
})();
