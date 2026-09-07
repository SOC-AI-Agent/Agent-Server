"""
Insert the default LLM model into the llm_models table.

Defaults match the llama.cpp service in docker-compose.yml (LLAMA_HF_MODEL).

Usage:
    python script/insert_default_model.py
    python script/insert_default_model.py --name Gemma3-1B --model-name ggml-org/gemma-3-1b-it-GGUF --provider llama.cpp
"""

import argparse
import os
import sys
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

DEFAULT_MODEL_NAME = os.getenv("LLAMA_HF_MODEL", "ggml-org/gemma-3-1b-it-GGUF")
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


def parse_args():
    parser = argparse.ArgumentParser(description="Insert/update the default LLM model.")
    parser.add_argument("--name", default=DEFAULT_MODEL_NAME)
    parser.add_argument("--model-name", default=DEFAULT_MODEL_NAME)
    parser.add_argument("--provider", default=DEFAULT_PROVIDER)
    return parser.parse_args()


def main():
    args = parse_args()

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
