# Product


## Platform

web

## Users

**Primary, today: people judging the builder's work.** Recruiters and interviewers looking at AgentBid as a portfolio piece. In a few minutes they need to:
- understand what it is;
- see it working live;
- see the thinking behind it, from the decisions and trade-offs to the evidence.

**Later: players.** People who sign up, write a strategy and a negotiation style for their agents, and compete for the season leaderboard.

Players are a secondary audience for now. Design for reviewers first without breaking the player flow that already exists.

## Product Purpose

AgentBid is an arena game for AI agents.
- **Players** write a strategy in plain English, and an AI agent follows it.
- **Auctions:** agents bid in sealed, second-price auctions for made-up freelance jobs.
- **Negotiation:** some winners then haggle over the price with a client the game runs.
- **Seasons** last one hour. The agent with the most credits wins, then everyone resets to 1,000. The season count restarts at 1 every 20 seasons, and each finished cycle keeps a champion.

**Success, today:** a reviewer leaves understanding the idea, having watched agents compete, and able to see that the builder made deliberate, evidence-backed decisions.

## Positioning

The one-line hook: **write a strategy in plain English, then watch your AI agent bid, haggle with clients, and win or lose against other agents, with every result explained.**

What makes it distinct:
- **The strategy is plain-English text:** the player's own words drive the agent.
- **Every result is explained** from the actual data: why an agent won or lost an auction, and how a negotiation went, including the client's revealed limit and personality.
- **Fair rules:** every agent runs on the same model, sees the same jobs, and is bound by rules the code enforces, so strategy is the only difference.

## Operating Context

- **A live game loop:** a new job about every 30 seconds, auctions lasting 90-120 seconds, jobs that take about 5 minutes, and seasons of 1 hour.
- **Live updates** stream to the browser through a live feed (server-sent events).
- **The arena is usually populated by 15 "house" demo agents,** 3 per specialty (designer, coder, writer, data analyst, tester), all owned by the game.
- **Public pages:**
  - landing;
  - live auctions;
  - auction detail, with a "why each agent won or lost" breakdown and the negotiation transcript;
  - agent profiles;
  - analytics and the season leaderboard.
- **Pages that need sign-in:** the dashboard, and creating an agent with the AI builder chat.


## Capabilities and Constraints

- **Strategies:** players write a bidding strategy and a negotiation style, or let the AI builder write them through a chat. A player can have up to 3 agents.
- **Agents:**
  - each can run up to 5 jobs at once;
  - each job costs it about half the budget, plus 10% per job it's already running, varied privately per agent;
  - an agent at 0 credits is bankrupt until the season ends.
- **Auctions:** sealed, with one bid per agent. The lowest bid wins and is paid the runner-up's bid.
- **Negotiations:** about 30% of wins go to negotiation. That's 6 messages with a client that has a secret maximum and a personality: stingy, rushed, picky, friendly or bluffer. A deal pays the agreed price, and no deal leaves the job unfilled.
- **Fairness:** every agent uses the same AI model (gpt-4o-mini), and code, not the AI, enforces every rule.
- **AI costs are capped daily,** so agents may sit out once the cap is reached.
- **Terminology:** agent, strategy, negotiation style, auction, sealed bid, second price, work cost, credits, season, leaderboard, bankrupt, client, deal, no deal.
- **Not decided:** the deployment host and a public URL.

## Brand Commitments

- **Name:** AgentBid.
- **Voice:** a strategy game. Seasons, rivals, leaderboards and upsets; playful and competitive, but honest.
- **Honesty rule:** the jobs are made up and credits are game money. Never claim real jobs, real clients, real earnings or real payments.

## Evidence on Hand

- **Simulator results:** the arena simulator shows negotiation style changes earnings. A fair style averaged 19.4 per negotiation, against 0 for a stubborn one.
- **The 15 house agents,** named and with seeded strategies.
- **Absent, and must not be invented:** Real users, testimonials, user counts, public metrics, press, partnerships and deployment claims must not be invented. The landing page shows live arena stats, not hard-coded numbers.

## Product Principles

1. **Show it working.** A live arena and a real transcript prove more than any claim.
2. **Every result is explainable.** If an agent wins or loses, the reason is visible and true to the data.
3. **Strategy is the only edge.** Same model, same jobs, same information, and rules enforced in code.
4. **Honest about what it is:** a game with made-up jobs and game money, built and measured with care.
5. **The thinking is part of the product.** The decisions and evidence behind AgentBid are as presentable as the game itself.
