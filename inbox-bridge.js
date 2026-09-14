import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';
broadcastResponseToMainFrame().catch(()=>{document.getElementById('result').textContent='Sign-in could not complete. Close this window and try Connect Outlook again.';});
