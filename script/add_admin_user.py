"""
Insert an admin user into the users table.

NOTE: the password is stored as PLAIN TEXT (no hashing), as requested.

Usage:
    python script/add_admin_user.py
    python script/add_admin_user.py --username admin --email admin@example.com --password admin123
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

UPSERT_ADMIN_SQL = """
    INSERT INTO users (username, email, password, is_active)
    VALUES (%s, %s, %s, true)
    ON CONFLICT (username) DO UPDATE
        SET email = EXCLUDED.email,
            password = EXCLUDED.password,
            updated_at = now()
    RETURNING id;
"""


def parse_args():
    parser = argparse.ArgumentParser(description="Create/update the admin user (plain text password).")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--email", default="admin@example.com")
    parser.add_argument("--password", default="admin123")
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
            cur.execute(UPSERT_ADMIN_SQL, (args.username, args.email, args.password))
            user_id = cur.fetchone()[0]
        print(f"Admin user ready: id={user_id} username={args.username} email={args.email}")
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Failed to create admin user: {exc}", file=sys.stderr)
        sys.exit(1)
