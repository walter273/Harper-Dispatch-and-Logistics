(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const status = document.getElementById('responseStatus'), form = document.getElementById('responseForm');
  let requestId = crypto.randomUUID();
  const send = async body => { const r = await fetch('/api/applicant-response', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }) }); const data = await r.json(); if (!r.ok) throw Error(data.error || 'Could not save response.'); return data; };
  send({ action: 'preview' }).then(data => { status.textContent = 'Your link is valid. Responses are shared with Harper staff.'; document.getElementById('responseRequest').textContent = data.message; form.hidden = false; }).catch(e => status.textContent = e.message);
  form.addEventListener('input', () => { requestId = crypto.randomUUID(); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('button'); if (button.disabled) return; button.disabled = true;
    try {
      const document = form.elements.document.files[0]; let file;
      if (document) {
        if (document.size > 3 * 1024 * 1024) throw Error('Choose a document under 3 MB.');
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(document); });
        file = { name: document.name, contentBase64: data.split(',')[1] };
      }
      await send({ requestId, note: form.elements.note.value, file });
      status.textContent = 'Your response was saved for staff review.'; form.reset(); requestId = crypto.randomUUID();
    } catch (e) { status.textContent = e.message; } finally { button.disabled = false; }
  });
})();
