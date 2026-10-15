"""
Insert an admin user into the users table.

NOTE: the password is stored as PLAIN TEXT (no hashing), as requested.

Usage:
    python script/add_admin_user.py
    python script/add_admin_user.py --username admin --email admin@example.com --password admin123
    python script/add_admin_user.py --if-missing     # what deploy_production runs

Without --if-missing an existing user of that name is updated: its email and
password are reset to the ones given. With it, an existing user is left
exactly as it is — so the deploy can run it every time and a password changed
in the admin UI stays changed.

The username and password can also come from the environment —
AGENT_ADMIN_USERNAME, AGENT_ADMIN_PASSWORD — which is how the deploy passes
them: never on a command line, where a quote in the password breaks it and
the host's process list shows it. The email, which the users table requires,
defaults to <username>@dall-m.local; nothing sends mail to it.
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
    INSERT INTO users (username, email, password, is_active, is_admin)
    VALUES (%s, %s, %s, true, true)
    ON CONFLICT (username) DO UPDATE
        SET email = EXCLUDED.email,
            password = EXCLUDED.password,
            is_admin = true,
            updated_at = now()
    RETURNING id;
"""

INSERT_IF_MISSING_SQL = """
    INSERT INTO users (username, email, password, is_active, is_admin)
    VALUES (%s, %s, %s, true, true)
    ON CONFLICT DO NOTHING
    RETURNING id;
"""


def parse_args():
    parser = argparse.ArgumentParser(description="Create/update the admin user (plain text password).")
    parser.add_argument("--username", default=os.getenv("AGENT_ADMIN_USERNAME") or "admin")
    parser.add_argument("--email", help="defaults to <username>@dall-m.local")
    parser.add_argument("--password", default=os.getenv("AGENT_ADMIN_PASSWORD") or "admin123")
    parser.add_argument("--if-missing", action="store_true",
                        help="create the user only if there is none of that name; never change one")
    args = parser.parse_args()
    args.email = args.email or f"{args.username}@dall-m.local"
    return args


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
            if not args.if_missing:
                cur.execute(UPSERT_ADMIN_SQL, (args.username, args.email, args.password))
                user_id = cur.fetchone()[0]
                print(f"Admin user ready: id={user_id} username={args.username} email={args.email}")
                return
            cur.execute(INSERT_IF_MISSING_SQL, (args.username, args.email, args.password))
            row = cur.fetchone()
            if row:
                print(f"Admin user created: id={row[0]} username={args.username} email={args.email}")
                return
            cur.execute("SELECT is_admin FROM users WHERE username = %s;", (args.username,))
            existing = cur.fetchone()
            if existing is None:
                raise SystemExit(f"Admin user not created: the email {args.email} belongs to another user. "
                                 "Change that user's email, or choose another AGENT_ADMIN_USERNAME.")
            kind = "an admin" if existing[0] else "a user WITHOUT admin rights"
            print(f"Admin user {args.username} already exists ({kind}) — left as it is, password unchanged")
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Failed to create admin user: {exc}", file=sys.stderr)
        sys.exit(1)
