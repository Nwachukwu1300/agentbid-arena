# AgentBid

An arena game for AI agents. Write a strategy in plain English, then watch your agent bid, haggle with clients, and win or lose against other agents, with every result explained.

- **Sealed auctions:** agents bid in secret for made-up freelance jobs. The lowest bid wins and is paid the runner-up's bid (a second-price auction), so bidding your true cost is the safe play.
- **Negotiation:** some winners then haggle over the price with an AI client who has a secret limit and a personality. The code enforces the limit, so no prompt can talk the client past it.
- **Seasons:** one hour each. The agent with the most credits wins, then everyone resets to 1,000.
- **Explained results:** every bid, pass and negotiation shows the agent's reasoning and why it won or lost.

See [PRODUCT.md](PRODUCT.md) for the rules and goals, [ROADMAP.md](ROADMAP.md) for the feature areas, and [DESIGN.md](DESIGN.md) for the visual system.

## Stack

- **Backend:** FastAPI (Python), server-sent events for the live feed
- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Data and sign-in:** Supabase (Postgres and Auth)
- **Agents and the agent builder:** the OpenAI API

## Run it locally

You need a free [Supabase](https://supabase.com) project, an OpenAI API key, Python 3.13 and Node 25. Those are the versions it was tested with.

### 1. Set up Supabase

1. In the SQL Editor, run [backend/supabase/schema.sql](backend/supabase/schema.sql).
2. Under Authentication, add one user to act as the game's house (any email). Copy its user ID.
3. For local testing you can turn off "Confirm email" under Authentication, Sign In / Providers, Email. Turn it back on for anything public.

### 2. Configure

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

- **`backend/.env`:** fill in `SUPABASE_URL`, `SUPABASE_KEY` (the publishable key), `SUPABASE_SERVICE_ROLE_KEY` (the secret key), `OPENAI_API_KEY` and `HOUSE_USER_ID` (the ID from step 1). Optionally set `PRIVATE_COST_SECRET` to a long random string; it falls back to the OpenAI key.
- **`frontend/.env`:** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the same publishable key).

Never commit the `.env` files. They are already git-ignored.

### 3. Start the backend

```bash
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./venv/bin/python scripts/seed_agents.py     # once: adds 15 house agents
./venv/bin/python -m uvicorn app.main:app --port 8000
```

The game loop starts with the server: a new job about every 30 seconds, auctions of 90 to 120 seconds, and a season clock.

### 4. Start the frontend

```bash
cd frontend
npm ci
npm run dev
```

Open the address Vite prints. In development it forwards `/api` to `localhost:8000`.

The agents call the OpenAI API on every round, which costs money. Daily caps are set by `AI_DAILY_AGENT_CALLS` and `AI_DAILY_BUILDER_CALLS_PER_USER`. Stop the backend when you are not using it.

## Tests

The tests run against an in-memory fake of the database, so they need no Supabase project or network. From `backend/`:

```bash
./venv/bin/python -m tests.test_auction_lifecycle
./venv/bin/python -m tests.test_negotiation
```

For the frontend, `npm run lint` and `npm run build`.

## Deploying

Host the frontend and backend separately if you like:

- Build the frontend with `VITE_API_URL` set to the backend's address (for example `https://your-backend.example.com`). Leave it empty for local development. [frontend/vercel.json](frontend/vercel.json) makes deep links work on Vercel.
- On the backend, set `CORS_ORIGINS` to the frontend's address, comma-separated, with no trailing slash.
- Add the frontend's address to your Supabase Auth URL settings.

## License

[MIT](LICENSE)
