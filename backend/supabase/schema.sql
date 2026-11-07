-- AgentBid Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE agent_specialty AS ENUM ('designer', 'coder', 'writer', 'data_analyst', 'tester');
CREATE TYPE job_status AS ENUM ('pending', 'in_auction', 'assigned', 'in_progress', 'completed');

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    specialty agent_specialty NOT NULL,
    auction_instructions TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 1000,
    current_jobs INTEGER NOT NULL DEFAULT 0 CHECK (current_jobs >= 0 AND current_jobs <= 5),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    specialty agent_specialty NOT NULL,
    base_price INTEGER NOT NULL CHECK (base_price > 0),
    status job_status NOT NULL DEFAULT 'pending',
    assigned_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    winning_bid INTEGER CHECK (winning_bid IS NULL OR winning_bid > 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_specialty ON agents(specialty);
CREATE INDEX IF NOT EXISTS idx_agents_is_active ON agents(is_active);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_specialty ON jobs(specialty);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_agent ON jobs(assigned_agent_id);

-- Row Level Security (RLS) policies

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile"
    ON users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (auth.uid() = id);

-- Agents: no policies, only the backend (service role) touches them

-- Jobs policies
CREATE POLICY "Anyone can view jobs"
    ON jobs FOR SELECT
    USING (TRUE);

CREATE POLICY "Service role can manage jobs"
    ON jobs FOR ALL
    USING (auth.role() = 'service_role');

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, created_at, updated_at)
    VALUES (NEW.id, NEW.email, NOW(), NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Auction System Tables
-- =============================================

-- Auction status enum
CREATE TYPE auction_status AS ENUM ('active', 'closed', 'cancelled');

-- Auctions table
CREATE TABLE IF NOT EXISTS auctions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),  -- length comes from AUCTION_*_DURATION_SECONDS
    status auction_status NOT NULL DEFAULT 'active',
    winning_bid_id UUID,  -- Will reference bids table
    winning_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    winning_amount INTEGER CHECK (winning_amount IS NULL OR winning_amount > 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ
);

-- Bids table
CREATE TABLE IF NOT EXISTS bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_winning BOOLEAN NOT NULL DEFAULT FALSE
);

-- Add foreign key for winning_bid_id after bids table exists
ALTER TABLE auctions
    ADD CONSTRAINT fk_winning_bid
    FOREIGN KEY (winning_bid_id) REFERENCES bids(id) ON DELETE SET NULL;

-- Indexes for auction performance
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_job_id ON auctions(job_id);
CREATE INDEX IF NOT EXISTS idx_auctions_ends_at ON auctions(ends_at);
CREATE INDEX IF NOT EXISTS idx_auctions_winning_agent ON auctions(winning_agent_id);

-- Indexes for bids performance
CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_agent_id ON bids(agent_id);
CREATE INDEX IF NOT EXISTS idx_bids_amount ON bids(amount);
CREATE INDEX IF NOT EXISTS idx_bids_created_at ON bids(created_at);

-- Composite index for finding winning bid (lowest amount, earliest time)
CREATE INDEX IF NOT EXISTS idx_bids_auction_amount_time ON bids(auction_id, amount, created_at);

-- Enable RLS on new tables
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

-- Auctions policies (anyone can view, service role manages)
CREATE POLICY "Anyone can view auctions"
    ON auctions FOR SELECT
    USING (TRUE);

CREATE POLICY "Service role can manage auctions"
    ON auctions FOR ALL
    USING (auth.role() = 'service_role');

-- Bids policies
CREATE POLICY "Service role can manage bids"
    ON bids FOR ALL
    USING (auth.role() = 'service_role');


-- =============================================
-- Agent Decisions (every bid/pass with its reasoning)
-- =============================================

CREATE TABLE IF NOT EXISTS agent_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    decision_type TEXT NOT NULL CHECK (decision_type IN ('bid', 'pass')),
    bid_amount INTEGER CHECK (bid_amount IS NULL OR bid_amount > 0),
    reasoning TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_decisions_agent_id ON agent_decisions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_decisions_auction_id ON agent_decisions(auction_id);

ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage agent decisions"
    ON agent_decisions FOR ALL
    USING (auth.role() = 'service_role');

-- =============================================
-- Seasons
-- =============================================

CREATE TABLE IF NOT EXISTS seasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    number INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
    started_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL
);

-- Final standings, frozen when a season ends
CREATE TABLE IF NOT EXISTS season_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    agent_name VARCHAR(100) NOT NULL,
    specialty agent_specialty NOT NULL,
    rank INTEGER NOT NULL,
    final_credits INTEGER NOT NULL,
    profit INTEGER NOT NULL,
    jobs_won INTEGER NOT NULL,
    win_rate REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status);
CREATE INDEX IF NOT EXISTS idx_season_results_season_id ON season_results(season_id);

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view seasons" ON seasons FOR SELECT USING (TRUE);
CREATE POLICY "Service role can manage seasons" ON seasons FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Anyone can view season results" ON season_results FOR SELECT USING (TRUE);
CREATE POLICY "Service role can manage season results" ON season_results FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- Sealed bids + workload cost
-- =============================================
ALTER TABLE bids ADD COLUMN IF NOT EXISTS work_cost INTEGER;  -- bidder's cost when it bid
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_cost INTEGER;  -- cost locked in for the winner

-- =============================================
-- Lock bids and decisions to the backend
-- =============================================
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bids_auction_agent_sealed
    ON bids (auction_id, agent_id);

-- =============================================
-- AI usage caps
-- =============================================
CREATE TABLE IF NOT EXISTS ai_usage (
    day DATE NOT NULL,
    key TEXT NOT NULL,          -- 'agents' or 'builder:<user id>'
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, key)
);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;  -- no policies: only the backend (service role) can touch it

-- Count one call if the key is under its limit for the day. Atomic, so concurrent calls can't overshoot.
CREATE OR REPLACE FUNCTION spend_ai_call(p_day DATE, p_key TEXT, p_limit INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE spent INTEGER;
BEGIN
    IF p_limit <= 0 THEN
        RETURN FALSE;
    END IF;
    INSERT INTO ai_usage AS u (day, key, calls) VALUES (p_day, p_key, 1)
    ON CONFLICT (day, key) DO UPDATE SET calls = u.calls + 1 WHERE u.calls < p_limit
    RETURNING calls INTO spent;
    RETURN spent IS NOT NULL;
END $$;

REVOKE EXECUTE ON FUNCTION spend_ai_call(DATE, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION spend_ai_call(DATE, TEXT, INTEGER) TO service_role;

-- =============================================
-- Atomic agent counters
-- =============================================
-- Change an agent's credits and job count in one statement, so concurrent game loops can't overwrite
-- each other. Returns no row when it would push current_jobs past 5 (the agent is full).
CREATE OR REPLACE FUNCTION adjust_agent(p_agent_id UUID, p_credits INTEGER, p_jobs INTEGER)
RETURNS SETOF agents
LANGUAGE sql
AS $$
    UPDATE agents
    SET credits = credits + p_credits,
        current_jobs = GREATEST(current_jobs + p_jobs, 0)
    WHERE id = p_agent_id AND current_jobs + p_jobs <= 5
    RETURNING *;
$$;

REVOKE EXECUTE ON FUNCTION adjust_agent(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION adjust_agent(UUID, INTEGER, INTEGER) TO service_role;

-- =============================================
-- Negotiations
-- =============================================

ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'negotiating';  -- won, price being negotiated
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'unfilled';     -- negotiation ended without a deal

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS negotiated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;  -- when work began (close or deal)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS negotiation_style TEXT;
ALTER TABLE season_results ADD COLUMN IF NOT EXISTS avg_negotiation_gain REAL;

CREATE TABLE IF NOT EXISTS negotiations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
    opening_price INTEGER NOT NULL CHECK (opening_price > 0),  -- the winning bid
    work_cost INTEGER NOT NULL,                                -- copied from the winning bid
    client_max_price INTEGER NOT NULL CHECK (client_max_price > 0),  -- secret
    client_personality TEXT NOT NULL,                                -- secret while active
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deal', 'no_deal')),
    end_reason TEXT CHECK (end_reason IN ('accepted', 'agent_walked', 'client_walked', 'max_turns', 'season_ended')),
    final_price INTEGER CHECK (final_price IS NULL OR final_price > 0),
    turn_count INTEGER NOT NULL DEFAULT 0,
    next_turn_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_negotiations_auction ON negotiations(auction_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_due ON negotiations(status, next_turn_at);
CREATE INDEX IF NOT EXISTS idx_negotiations_agent ON negotiations(agent_id);
CREATE INDEX IF NOT EXISTS idx_negotiations_season ON negotiations(season_id);

CREATE TABLE IF NOT EXISTS negotiation_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negotiation_id UUID NOT NULL REFERENCES negotiations(id) ON DELETE CASCADE,
    speaker TEXT NOT NULL CHECK (speaker IN ('client', 'agent')),
    turn_number INTEGER NOT NULL,
    message TEXT NOT NULL,
    offer INTEGER,
    action TEXT NOT NULL CHECK (action IN ('counter', 'accept', 'walk_away')),
    was_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (negotiation_id, turn_number)  -- a turn can't be taken twice
);

ALTER TABLE negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE negotiation_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage negotiations" ON negotiations
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can manage negotiation messages" ON negotiation_messages
    FOR ALL USING (auth.role() = 'service_role');

-- =============================================
-- Strategy versions
-- =============================================
-- Every strategy edit makes a new version, and each decision records the version that made it.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS strategy_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agent_decisions ADD COLUMN IF NOT EXISTS strategy_version INTEGER;  -- NULL: made before versions were tracked

CREATE TABLE IF NOT EXISTS strategy_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    auction_instructions TEXT NOT NULL,
    negotiation_style TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (agent_id, version)
);
-- Existing agents start at version 1 with their current strategy
INSERT INTO strategy_versions (agent_id, version, auction_instructions, negotiation_style)
    SELECT id, 1, auction_instructions, negotiation_style FROM agents
    ON CONFLICT (agent_id, version) DO NOTHING;
ALTER TABLE strategy_versions ENABLE ROW LEVEL SECURITY;  -- no policies: strategies are owner-only, served by the backend

-- =============================================
-- Experiments (strategy replays, never part of live play)
-- =============================================
CREATE TABLE IF NOT EXISTS experiments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    version_a INTEGER NOT NULL,
    version_b INTEGER,              -- NULL when B was an unsaved draft
    draft_instructions TEXT,
    cost INTEGER NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_experiments_agent ON experiments(agent_id, created_at DESC);
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;  -- no policies: only the backend touches it
