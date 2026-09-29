"""
Create the LLM_Server database schema in PostgreSQL.

Schema is based on script/draw-erd.txt (DBML) and connects using the
credentials defined in the project's .env file / docker-compose.yml
(dall-m-db service).

Usage:
    python script/create_db.py
"""

import os
import sys
import time
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5497")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

MAX_RETRIES = 10
RETRY_DELAY_SECONDS = 3


# Statements are ordered so that referenced tables are created before the
# tables that reference them.
STATEMENTS = [
    'CREATE EXTENSION IF NOT EXISTS pgcrypto;',

    # ========================================
    # USERS
    # ========================================
    """
    CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        username varchar(100) NOT NULL UNIQUE,
        email varchar(255) NOT NULL UNIQUE,
        password varchar(255),

        is_active boolean NOT NULL DEFAULT true,
        is_admin boolean NOT NULL DEFAULT false,

        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
    );
    """,
    # Safety net for databases created before is_admin existed.
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;',
    'CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);',
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);',

    # ========================================
    # LLM MODELS
    # ========================================
    """
    CREATE TABLE IF NOT EXISTS llm_models (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        name varchar(100) NOT NULL,

        -- Example: llama3.1:8b, qwen3:8b, mistral:7b
        model_name varchar(255) NOT NULL,

        -- Example: ollama, vllm, llama.cpp, openai-compatible
        provider varchar(100),

        is_active boolean NOT NULL DEFAULT true,

        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
    );
    """,
    'CREATE INDEX IF NOT EXISTS idx_llm_models_model_name ON llm_models (model_name);',
    'CREATE INDEX IF NOT EXISTS idx_llm_models_provider ON llm_models (provider);',

    # ========================================
    # AGENTS
    # ========================================
    """
    CREATE TABLE IF NOT EXISTS agents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Public API identifier, e.g. customer-support
        slug varchar(100) NOT NULL UNIQUE,

        name varchar(255) NOT NULL,
        description text,

        owner_id uuid NOT NULL REFERENCES users (id),

        -- Model used by this agent
        model_id uuid REFERENCES llm_models (id),

        is_active boolean NOT NULL DEFAULT true,

        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
    );
    """,
    'CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents (slug);',
    'CREATE INDEX IF NOT EXISTS idx_agents_owner_id ON agents (owner_id);',
    'CREATE INDEX IF NOT EXISTS idx_agents_model_id ON agents (model_id);',

    # ========================================
    # AGENT PROMPTS
    # ========================================
    """
    CREATE TABLE IF NOT EXISTS agent_prompts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        agent_id uuid NOT NULL REFERENCES agents (id),

        -- Prompt version
        version int NOT NULL,

        system_prompt text NOT NULL,

        is_active boolean NOT NULL DEFAULT false,

        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
    );
    """,
    'CREATE INDEX IF NOT EXISTS idx_agent_prompts_agent_id ON agent_prompts (agent_id);',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_prompts_agent_version ON agent_prompts (agent_id, version);',
    'CREATE INDEX IF NOT EXISTS idx_agent_prompts_agent_active ON agent_prompts (agent_id, is_active);',

    # ========================================
    # AGENT GENERATION CONFIG
    # ========================================
    """
    CREATE TABLE IF NOT EXISTS agent_configs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        agent_id uuid NOT NULL UNIQUE REFERENCES agents (id),

        -- Generation Parameters (0.0 - 2.0)
        temperature decimal(4,3) DEFAULT 0.700,

        -- Maximum tokens generated
        max_tokens int,

        -- Probability sampling (0.0 - 1.0)
        top_p decimal(4,3),

        -- Top-K sampling
        top_k int,

        -- Maximum context window
        context_window int,

        repetition_penalty decimal(4,3),

        seed int,

        streaming_enabled boolean NOT NULL DEFAULT true,

        -- Extra model-specific parameters, e.g. {"min_p": 0.05, "repeat_last_n": 64}
        extra_config json,

        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
    );
    """,

    # ========================================
    # INFERENCE REQUESTS
    # ========================================
    # An audit log that outlives the agents it records: each row carries its own
    # copy of the agent and the exact system prompt sent, so deleting an agent
    # (or editing a prompt version in place) never changes or removes history.
    """
    CREATE TABLE IF NOT EXISTS inference_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Link to the live agent / prompt; NULL once that agent is deleted
        agent_id uuid REFERENCES agents (id) ON DELETE SET NULL,
        prompt_id uuid REFERENCES agent_prompts (id) ON DELETE SET NULL,

        -- Snapshot taken at call time
        agent_slug varchar(100) NOT NULL,
        agent_name varchar(255) NOT NULL,
        owner_id uuid NOT NULL,
        prompt_version int NOT NULL,
        system_prompt text NOT NULL,

        -- Exact model used
        model_id uuid REFERENCES llm_models (id),

        api_client_id uuid,

        -- Request
        user_prompt text NOT NULL,

        -- Response
        assistant_response text,

        -- Token Usage
        input_tokens int,
        output_tokens int,
        total_tokens int,

        -- Performance
        latency_ms int,

        -- Status
        status varchar(50) NOT NULL,
        error_message text,

        created_at timestamp NOT NULL DEFAULT now()
    );
    """,
    'CREATE INDEX IF NOT EXISTS idx_inference_requests_agent_id ON inference_requests (agent_id);',
    'CREATE INDEX IF NOT EXISTS idx_inference_requests_prompt_id ON inference_requests (prompt_id);',
    'CREATE INDEX IF NOT EXISTS idx_inference_requests_model_id ON inference_requests (model_id);',
    'CREATE INDEX IF NOT EXISTS idx_inference_requests_api_client_id ON inference_requests (api_client_id);',
    'CREATE INDEX IF NOT EXISTS idx_inference_requests_created_at ON inference_requests (created_at);',
    'CREATE INDEX IF NOT EXISTS idx_inference_requests_status ON inference_requests (status);',

    # Upgrade for databases created before history was decoupled from agents:
    # add the snapshot columns, fill them from the rows they still link to, then
    # let the links go NULL instead of blocking the agent's deletion.
    'ALTER TABLE inference_requests ADD COLUMN IF NOT EXISTS agent_slug varchar(100);',
    'ALTER TABLE inference_requests ADD COLUMN IF NOT EXISTS agent_name varchar(255);',
    'ALTER TABLE inference_requests ADD COLUMN IF NOT EXISTS owner_id uuid;',
    'ALTER TABLE inference_requests ADD COLUMN IF NOT EXISTS prompt_version int;',
    'ALTER TABLE inference_requests ADD COLUMN IF NOT EXISTS system_prompt text;',
    """
    UPDATE inference_requests ir
    SET agent_slug = a.slug, agent_name = a.name, owner_id = a.owner_id
    FROM agents a
    WHERE a.id = ir.agent_id AND ir.agent_slug IS NULL;
    """,
    # Best effort for old rows: the prompt text as it reads now, which is the text
    # that ran unless that version was edited in place since.
    """
    UPDATE inference_requests ir
    SET prompt_version = ap.version, system_prompt = ap.system_prompt
    FROM agent_prompts ap
    WHERE ap.id = ir.prompt_id AND ir.system_prompt IS NULL;
    """,
    'ALTER TABLE inference_requests ALTER COLUMN agent_slug SET NOT NULL;',
    'ALTER TABLE inference_requests ALTER COLUMN agent_name SET NOT NULL;',
    'ALTER TABLE inference_requests ALTER COLUMN owner_id SET NOT NULL;',
    'ALTER TABLE inference_requests ALTER COLUMN prompt_version SET NOT NULL;',
    'ALTER TABLE inference_requests ALTER COLUMN system_prompt SET NOT NULL;',
    'ALTER TABLE inference_requests ALTER COLUMN agent_id DROP NOT NULL;',
    'ALTER TABLE inference_requests ALTER COLUMN prompt_id DROP NOT NULL;',
    'ALTER TABLE inference_requests DROP CONSTRAINT IF EXISTS inference_requests_agent_id_fkey;',
    'ALTER TABLE inference_requests ADD CONSTRAINT inference_requests_agent_id_fkey '
    'FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE SET NULL;',
    'ALTER TABLE inference_requests DROP CONSTRAINT IF EXISTS inference_requests_prompt_id_fkey;',
    'ALTER TABLE inference_requests ADD CONSTRAINT inference_requests_prompt_id_fkey '
    'FOREIGN KEY (prompt_id) REFERENCES agent_prompts (id) ON DELETE SET NULL;',
    'CREATE INDEX IF NOT EXISTS idx_inference_requests_owner_id ON inference_requests (owner_id);',

    # History cannot be deleted — not through the API, and not by a stray
    # DELETE/TRUNCATE either. Clearing it is a deliberate act: disable these
    # triggers first.
    """
    CREATE OR REPLACE FUNCTION forbid_inference_request_delete() RETURNS trigger AS $$
    BEGIN
        RAISE EXCEPTION 'inference_requests is an audit log: rows cannot be deleted';
    END;
    $$ LANGUAGE plpgsql;
    """,
    'DROP TRIGGER IF EXISTS inference_requests_no_delete ON inference_requests;',
    'CREATE TRIGGER inference_requests_no_delete BEFORE DELETE ON inference_requests '
    'FOR EACH ROW EXECUTE FUNCTION forbid_inference_request_delete();',
    'DROP TRIGGER IF EXISTS inference_requests_no_truncate ON inference_requests;',
    'CREATE TRIGGER inference_requests_no_truncate BEFORE TRUNCATE ON inference_requests '
    'FOR EACH STATEMENT EXECUTE FUNCTION forbid_inference_request_delete();',
]


def connect_with_retry():
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            conn = psycopg2.connect(
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=DB_PASSWORD,
                dbname=DB_NAME,
            )
            return conn
        except psycopg2.OperationalError as exc:
            last_error = exc
            print(f"[{attempt}/{MAX_RETRIES}] Database not ready yet ({exc.__class__.__name__}), "
                  f"retrying in {RETRY_DELAY_SECONDS}s...")
            time.sleep(RETRY_DELAY_SECONDS)
    raise SystemExit(f"Could not connect to the database after {MAX_RETRIES} attempts: {last_error}")


def main():
    if not all([DB_USER, DB_PASSWORD, DB_NAME]):
        raise SystemExit("Missing DB_USER, DB_PASSWORD, or DB_NAME. Check your .env file.")

    print(f"Connecting to postgresql://{DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME} ...")
    conn = connect_with_retry()
    conn.autocommit = True

    try:
        with conn.cursor() as cur:
            for statement in STATEMENTS:
                cur.execute(statement)
        print("Schema created successfully: users, llm_models, agents, "
              "agent_prompts, agent_configs, inference_requests.")
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Failed to create schema: {exc}", file=sys.stderr)
        sys.exit(1)
