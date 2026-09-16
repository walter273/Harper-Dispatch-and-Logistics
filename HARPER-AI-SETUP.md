# Harper AI setup

Harper AI uses the OpenAI Responses API from the server. Keep the real API key in Railway, never in GitHub.

## Required Railway variables

Add these variables to the production service `alphaway-tms-staging-app`:

```text
OPENAI_API_KEY=<add the secret value in Railway>
OPENAI_MODEL=gpt-5-mini
```

## Railway steps

1. Open the **AlphaWay TMS Staging** project.
2. Select **alphaway-tms-staging-app**.
3. Open **Variables**.
4. Add `OPENAI_API_KEY` with the secret API key.
5. Add `OPENAI_MODEL` with `gpt-5-mini` (optional; this is already the application default).
6. Save the variables and wait for the production redeployment to succeed.
7. Sign in at `https://www.harperloadboard.com/workspace.html` and test Harper AI.

## Security rules

- Never commit a real API key to this repository.
- Never place a real key in `.env.example`.
- Never expose the key in browser-side JavaScript or HTML.
- If a key is accidentally committed, revoke it immediately and create a replacement.
