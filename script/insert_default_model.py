"""
Insert the default LLM model into the llm_models table.

The default is whatever llama-server is serving, asked from it
(GET <LLM_BASE_URL>/v1/models) — so run this once dall-m-llamacpp is up.
Which model that is is chosen in llamacpp/preload_models.py and nowhere else.

Usage:
    python script/insert_default_model.py
    python script/insert_default_model.py --name "<label>" --model-name <org>/<repo> --provider llama.cpp
"""

import argparse
import json
import os
import sys
import urllib.request
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

LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8080")
DEFAULT_PROVIDER = "llama.cpp"

SELECT_MODEL_SQL = "SELECT id FROM llm_models WHERE model_name = %s;"

UPDATE_MODEL_SQL = """
    UPDATE llm_models
    SET name = %s,
        provider = %s,
        is_active = true,
        updated_at = now()
    WHERE id = %s
    RETURNING id;
"""

INSERT_MODEL_SQL = """
    INSERT INTO llm_models (name, model_name, provider, is_active)
    VALUES (%s, %s, %s, true)
    RETURNING id;
"""


def served_model() -> str:
    """The model llama-server reports serving — the name it was started with.
    Never through a proxy: llama-server is on this machine or this compose
    network, and an office proxy in the environment cannot reach either."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(f"{LLM_BASE_URL}/v1/models", timeout=30) as response:
        return json.load(response)["data"][0]["id"]


def parse_args():
    parser = argparse.ArgumentParser(description="Insert/update the default LLM model.")
    parser.add_argument("--name", help="label shown for it; defaults to the model name")
    parser.add_argument("--model-name", help="defaults to what llama-server is serving")
    parser.add_argument("--provider", default=DEFAULT_PROVIDER)
    return parser.parse_args()


def main():
    args = parse_args()
    if not args.model_name:
        try:
            args.model_name = served_model()
        except Exception as exc:
            raise SystemExit(f"Could not ask llama-server at {LLM_BASE_URL} what it serves ({exc}). "
                             "Is dall-m-llamacpp up? Or pass --model-name.")
    args.name = args.name or args.model_name

    if not all([DB_USER, DB_PASSWORD, DB_NAME]):
        raise SystemExit("Missing DB_USER, DB_PASSWORD, or DB_NAME. Check your .env file.")

    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=DB_NAME,
    )
    conn.autocommit = True

    try:
        with conn.cursor() as cur:
            cur.execute(SELECT_MODEL_SQL, (args.model_name,))
            row = cur.fetchone()

            if row:
                cur.execute(UPDATE_MODEL_SQL, (args.name, args.provider, row[0]))
            else:
                cur.execute(INSERT_MODEL_SQL, (args.name, args.model_name, args.provider))

            model_id = cur.fetchone()[0]

        print(f"Default model ready: id={model_id} name={args.name} "
              f"model_name={args.model_name} provider={args.provider}")
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Failed to insert default model: {exc}", file=sys.stderr)
        sys.exit(1)
