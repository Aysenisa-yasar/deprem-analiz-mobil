import os
import random
import re
import sqlite3
import threading
import time
import uuid
from typing import Any, Optional

from werkzeug.security import check_password_hash, generate_password_hash

from config import DATA_DIR

_db_lock = threading.Lock()
DB_PATH = os.path.join(DATA_DIR, "mobile_social.db")
OTP_TTL_SEC = 5 * 60
OTP_MAX_ATTEMPTS = 5


def _conn() -> sqlite3.Connection:
    os.makedirs(DATA_DIR, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def _table_columns(table_name: str) -> set[str]:
    with _conn() as db:
        rows = db.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {str(row["name"]) for row in rows}


def _ensure_column(table_name: str, column_sql: str, column_name: str) -> None:
    if column_name in _table_columns(table_name):
        return
    with _db_lock:
        with _conn() as db:
            db.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_sql}")
            db.commit()


def init_mobile_db() -> None:
    with _db_lock:
        with _conn() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS mobile_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    token TEXT UNIQUE,
                    emergency_contact TEXT,
                    created_at REAL DEFAULT (strftime('%s','now'))
                );
                CREATE TABLE IF NOT EXISTS mobile_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    from_user TEXT NOT NULL COLLATE NOCASE,
                    to_user TEXT NOT NULL COLLATE NOCASE,
                    body TEXT NOT NULL,
                    kind TEXT NOT NULL DEFAULT 'user',
                    created_at REAL DEFAULT (strftime('%s','now')),
                    delivered_at REAL,
                    read_at REAL
                );
                CREATE INDEX IF NOT EXISTS idx_msg_to ON mobile_messages(to_user, id DESC);
                CREATE INDEX IF NOT EXISTS idx_msg_from ON mobile_messages(from_user, id DESC);
                CREATE TABLE IF NOT EXISTS mobile_alert_log (
                    username TEXT NOT NULL COLLATE NOCASE,
                    event_key TEXT NOT NULL,
                    created_at REAL DEFAULT (strftime('%s','now')),
                    PRIMARY KEY (username, event_key)
                );
                CREATE TABLE IF NOT EXISTS mobile_auth_codes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    channel TEXT NOT NULL,
                    target TEXT NOT NULL COLLATE NOCASE,
                    code TEXT NOT NULL,
                    expires_at REAL NOT NULL,
                    consumed_at REAL,
                    attempt_count INTEGER NOT NULL DEFAULT 0,
                    created_at REAL DEFAULT (strftime('%s','now'))
                );
                CREATE INDEX IF NOT EXISTS idx_auth_codes_target ON mobile_auth_codes(channel, target, created_at DESC);
                """
            )
            db.commit()

    _ensure_column("mobile_users", "phone TEXT", "phone")
    _ensure_column("mobile_users", "email TEXT", "email")
    _ensure_column("mobile_users", "auth_channel TEXT DEFAULT 'password'", "auth_channel")
    _ensure_column("mobile_users", "display_name TEXT", "display_name")
    _ensure_column("mobile_users", "verified_at REAL", "verified_at")
    _ensure_column("mobile_users", "supabase_user_id TEXT", "supabase_user_id")


def _valid_username(username: str) -> bool:
    value = username.strip()
    if len(value) < 3 or len(value) > 32:
        return False
    for char in value:
        if char.isalnum() or char == "_":
            continue
        return False
    return True


def _normalize_phone(value: str) -> str:
    digits = "".join(char for char in value if char.isdigit())
    if digits.startswith("90") and len(digits) == 12:
        return f"+{digits}"
    if digits.startswith("0") and len(digits) == 11:
        return f"+9{digits}"
    if len(digits) == 10:
        return f"+90{digits}"
    if value.strip().startswith("+") and 11 <= len(digits) <= 15:
        return f"+{digits}"
    return ""


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _detect_auth_channel(value: str) -> Optional[str]:
    if "@" in value:
        return "email"
    if _normalize_phone(value):
        return "phone"
    return None


def _valid_auth_target(channel: str, target: str) -> bool:
    if channel == "phone":
        return bool(_normalize_phone(target))
    if channel == "email":
        return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", _normalize_email(target)))
    return False


def _canonical_target(channel: str, target: str) -> str:
    if channel == "phone":
        return _normalize_phone(target)
    return _normalize_email(target)


def _username_taken(username: str) -> bool:
    with _conn() as db:
        row = db.execute(
            "SELECT 1 FROM mobile_users WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
    return row is not None


def _unique_username_from_target(target: str) -> str:
    if "@" in target:
        base = target.split("@", 1)[0]
    else:
        base = target[-10:]

    cleaned = "".join(char.lower() if char.isalnum() else "_" for char in base)
    cleaned = cleaned.strip("_") or "kullanici"
    candidate = cleaned[:24]
    if len(candidate) < 3:
        candidate = f"user_{candidate}".strip("_")

    if not _username_taken(candidate):
        return candidate

    suffix = 1
    while True:
        retry = f"{candidate[:24]}_{suffix}"
        if not _username_taken(retry):
            return retry
        suffix += 1


def _generate_token() -> str:
    return uuid.uuid4().hex


def _dev_mode_enabled() -> bool:
    return os.getenv("MOBILE_AUTH_DEV_MODE", "1").strip().lower() not in {"0", "false", "no"}


def register_user(username: str, password: str) -> tuple[bool, str]:
    init_mobile_db()
    if not _valid_username(username):
        return False, "Gecersiz kullanici adi (3-32 karakter, harf/rakam/_)"
    if len(password) < 4:
        return False, "Sifre en az 4 karakter olmali"

    password_hash = generate_password_hash(password)
    token = _generate_token()
    with _db_lock:
        try:
            with _conn() as db:
                db.execute(
                    """
                    INSERT INTO mobile_users (username, password_hash, token, auth_channel)
                    VALUES (?, ?, ?, 'password')
                    """,
                    (username.strip(), password_hash, token),
                )
                db.commit()
        except sqlite3.IntegrityError:
            return False, "Bu kullanici adi alinmis"
    return True, token


def login_user(username: str, password: str) -> Optional[str]:
    init_mobile_db()
    with _db_lock:
        with _conn() as db:
            row = db.execute(
                "SELECT password_hash FROM mobile_users WHERE username = ? COLLATE NOCASE",
                (username.strip(),),
            ).fetchone()
            if not row:
                return None
            if not check_password_hash(row["password_hash"], password):
                return None

            new_token = _generate_token()
            db.execute(
                "UPDATE mobile_users SET token = ? WHERE username = ? COLLATE NOCASE",
                (new_token, username.strip()),
            )
            db.commit()
            return new_token


def start_auth_challenge(target: str) -> tuple[bool, dict[str, Any]]:
    init_mobile_db()
    channel = _detect_auth_channel(target)
    if not channel:
        return False, {"message": "Telefon numarasi veya e-posta girin"}
    if not _valid_auth_target(channel, target):
        return False, {"message": "Gecersiz telefon veya e-posta"}

    canonical = _canonical_target(channel, target)
    code = f"{random.randint(0, 999999):06d}"
    now = time.time()
    expires_at = now + OTP_TTL_SEC

    with _db_lock:
        with _conn() as db:
            db.execute(
                """
                UPDATE mobile_auth_codes
                SET consumed_at = ?
                WHERE channel = ? AND target = ? AND consumed_at IS NULL
                """,
                (now, channel, canonical),
            )
            db.execute(
                """
                INSERT INTO mobile_auth_codes (channel, target, code, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                (channel, canonical, code, expires_at),
            )
            db.commit()

    payload: dict[str, Any] = {
        "channel": channel,
        "target": canonical,
        "expires_in_sec": OTP_TTL_SEC,
        "message": "Dogrulama kodu hazirlandi",
    }
    if _dev_mode_enabled():
        payload["debug_code"] = code
        payload["message"] = "Gelisim modunda dogrulama kodu uretildi"
    return True, payload


def _find_user_by_identity(channel: str, canonical: str) -> Optional[sqlite3.Row]:
    field = "phone" if channel == "phone" else "email"
    with _conn() as db:
        return db.execute(
            f"SELECT * FROM mobile_users WHERE {field} = ? COLLATE NOCASE",
            (canonical,),
        ).fetchone()


def _find_user_by_supabase_id(supabase_user_id: str) -> Optional[sqlite3.Row]:
    if not supabase_user_id.strip():
        return None
    with _conn() as db:
        return db.execute(
            "SELECT * FROM mobile_users WHERE supabase_user_id = ?",
            (supabase_user_id.strip(),),
        ).fetchone()


def _create_user_from_identity(channel: str, canonical: str) -> dict[str, Any]:
    username = _unique_username_from_target(canonical)
    token = _generate_token()
    password_hash = generate_password_hash(uuid.uuid4().hex)
    display_name = canonical if channel == "email" else canonical[-10:]
    now = time.time()

    with _db_lock:
        with _conn() as db:
            db.execute(
                f"""
                INSERT INTO mobile_users (
                    username, password_hash, token, {channel}, auth_channel, display_name, verified_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (username, password_hash, token, canonical, channel, display_name, now),
            )
            db.commit()

    return {
        "username": username,
        "token": token,
        "auth_channel": channel,
    }


def verify_auth_challenge(target: str, code: str) -> tuple[bool, dict[str, Any]]:
    init_mobile_db()
    channel = _detect_auth_channel(target)
    if not channel:
        return False, {"message": "Telefon numarasi veya e-posta girin"}

    canonical = _canonical_target(channel, target)
    now = time.time()

    with _db_lock:
        with _conn() as db:
            row = db.execute(
                """
                SELECT id, code, expires_at, attempt_count
                FROM mobile_auth_codes
                WHERE channel = ? AND target = ? AND consumed_at IS NULL
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (channel, canonical),
            ).fetchone()

            if not row:
                return False, {"message": "Aktif dogrulama kodu bulunamadi"}
            if float(row["expires_at"]) < now:
                return False, {"message": "Dogrulama kodunun suresi doldu"}
            if int(row["attempt_count"]) >= OTP_MAX_ATTEMPTS:
                return False, {"message": "Cok fazla deneme yapildi"}
            if str(row["code"]) != code.strip():
                db.execute(
                    """
                    UPDATE mobile_auth_codes
                    SET attempt_count = attempt_count + 1
                    WHERE id = ?
                    """,
                    (int(row["id"]),),
                )
                db.commit()
                return False, {"message": "Dogrulama kodu hatali"}

            db.execute(
                "UPDATE mobile_auth_codes SET consumed_at = ? WHERE id = ?",
                (now, int(row["id"])),
            )

            existing_user = _find_user_by_identity(channel, canonical)
            if existing_user:
                token = _generate_token()
                db.execute(
                    f"""
                    UPDATE mobile_users
                    SET token = ?, auth_channel = ?, verified_at = ?, {channel} = ?
                    WHERE id = ?
                    """,
                    (token, channel, now, canonical, int(existing_user["id"])),
                )
                db.commit()
                return True, {
                    "token": token,
                    "username": existing_user["username"],
                    "auth_channel": channel,
                }

            db.commit()

    created = _create_user_from_identity(channel, canonical)
    return True, created


def _preferred_identity_from_supabase_user(user: dict[str, Any]) -> tuple[str, str]:
    phone = _normalize_phone(str(user.get("phone") or ""))
    email = _normalize_email(str(user.get("email") or ""))
    if phone:
        return "phone", phone
    if email:
        return "email", email
    return "email", _normalize_email(str(user.get("id") or "supabase-user"))


def upsert_user_from_supabase_identity(user: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
    init_mobile_db()

    supabase_user_id = str(user.get("id") or "").strip()
    if not supabase_user_id:
        return False, {"message": "Supabase kullanicisi dogrulanamadi"}

    channel, canonical = _preferred_identity_from_supabase_user(user)
    if not canonical:
        return False, {"message": "Supabase kullanicisinin e-posta veya telefonu bulunamadi"}

    now = time.time()
    existing = _find_user_by_supabase_id(supabase_user_id) or _find_user_by_identity(channel, canonical)

    if existing:
        token = _generate_token()
        phone_value = _normalize_phone(str(user.get("phone") or "")) or existing["phone"]
        email_value = _normalize_email(str(user.get("email") or "")) or existing["email"]
        with _db_lock:
            with _conn() as db:
                db.execute(
                    """
                    UPDATE mobile_users
                    SET token = ?, auth_channel = ?, verified_at = ?, phone = ?, email = ?, supabase_user_id = ?
                    WHERE id = ?
                    """,
                    (
                        token,
                        channel,
                        now,
                        phone_value,
                        email_value,
                        supabase_user_id,
                        int(existing["id"]),
                    ),
                )
                db.commit()
        return True, {
            "token": token,
            "username": existing["username"],
            "auth_channel": channel,
        }

    username = _unique_username_from_target(canonical)
    token = _generate_token()
    password_hash = generate_password_hash(uuid.uuid4().hex)
    display_name = canonical if channel == "email" else canonical[-10:]
    phone_value = _normalize_phone(str(user.get("phone") or ""))
    email_value = _normalize_email(str(user.get("email") or ""))

    with _db_lock:
        with _conn() as db:
            db.execute(
                """
                INSERT INTO mobile_users (
                    username,
                    password_hash,
                    token,
                    emergency_contact,
                    phone,
                    email,
                    auth_channel,
                    display_name,
                    verified_at,
                    supabase_user_id
                )
                VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
                """,
                (
                    username,
                    password_hash,
                    token,
                    phone_value or None,
                    email_value or None,
                    channel,
                    display_name,
                    now,
                    supabase_user_id,
                ),
            )
            db.commit()

    return True, {
        "token": token,
        "username": username,
        "auth_channel": channel,
    }


def user_from_token(token: str) -> Optional[dict[str, Any]]:
    if not token:
        return None
    init_mobile_db()
    with _db_lock:
        with _conn() as db:
            row = db.execute(
                """
                SELECT username, emergency_contact, phone, email, auth_channel
                FROM mobile_users
                WHERE token = ?
                """,
                (token.strip(),),
            ).fetchone()
            if not row:
                return None
            return {
                "username": row["username"],
                "emergency_contact": row["emergency_contact"],
                "phone": row["phone"],
                "email": row["email"],
                "auth_channel": row["auth_channel"] or "password",
            }


def set_emergency_contact(username: str, contact_username: Optional[str]) -> tuple[bool, str]:
    init_mobile_db()
    contact = (contact_username or "").strip()
    if not contact:
        with _db_lock:
            with _conn() as db:
                db.execute(
                    "UPDATE mobile_users SET emergency_contact = NULL WHERE username = ? COLLATE NOCASE",
                    (username,),
                )
                db.commit()
        return True, ""
    if not _valid_username(contact):
        return False, "Gecersiz acil kullanici adi"
    if contact.lower() == username.lower():
        return False, "Kendinizi acil kisi olarak secemezsiniz"
    with _db_lock:
        with _conn() as db:
            existing = db.execute(
                "SELECT 1 FROM mobile_users WHERE username = ? COLLATE NOCASE",
                (contact,),
            ).fetchone()
            if not existing:
                return False, "Acil kisi kayitli bir kullanici olmali"
            db.execute(
                "UPDATE mobile_users SET emergency_contact = ? WHERE username = ? COLLATE NOCASE",
                (contact, username),
            )
            db.commit()
    return True, ""


def send_user_message(from_user: str, to_user: str, body: str) -> tuple[bool, str]:
    message = (body or "").strip()
    if not message or len(message) > 4000:
        return False, "Mesaj bos veya cok uzun (max 4000)"
    init_mobile_db()
    recipient = to_user.strip()
    if not _valid_username(recipient):
        return False, "Gecersiz alici"

    with _db_lock:
        with _conn() as db:
            existing = db.execute(
                "SELECT 1 FROM mobile_users WHERE username = ? COLLATE NOCASE",
                (recipient,),
            ).fetchone()
            if not existing:
                return False, "Alici bulunamadi"
            db.execute(
                """
                INSERT INTO mobile_messages (from_user, to_user, body, kind, delivered_at)
                VALUES (?, ?, ?, 'user', ?)
                """,
                (from_user, recipient, message, time.time()),
            )
            db.commit()
    return True, ""


def fetch_messages(username: str, since_id: int = 0, limit: int = 100) -> list[dict[str, Any]]:
    init_mobile_db()
    safe_limit = min(max(1, limit), 200)
    with _db_lock:
        with _conn() as db:
            rows = db.execute(
                """
                SELECT id, from_user, to_user, body, kind, created_at, delivered_at, read_at
                FROM mobile_messages
                WHERE (to_user = ? COLLATE NOCASE OR from_user = ? COLLATE NOCASE)
                  AND id > ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (username, username, since_id, safe_limit),
            ).fetchall()
            db.execute(
                """
                UPDATE mobile_messages
                SET read_at = COALESCE(read_at, ?)
                WHERE to_user = ? COLLATE NOCASE AND id > ?
                """,
                (time.time(), username, since_id),
            )
            db.commit()
    return [dict(row) for row in rows]


def try_record_alert(username: str, event_key: str) -> bool:
    init_mobile_db()
    with _db_lock:
        try:
            with _conn() as db:
                db.execute(
                    "INSERT INTO mobile_alert_log (username, event_key) VALUES (?, ?)",
                    (username, event_key),
                )
                db.commit()
            return True
        except sqlite3.IntegrityError:
            return False


def add_system_message(from_user: str, to_user: str, body: str, kind: str) -> None:
    init_mobile_db()
    with _db_lock:
        with _conn() as db:
            db.execute(
                """
                INSERT INTO mobile_messages (from_user, to_user, body, kind, delivered_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (from_user, to_user, body, kind, time.time()),
            )
            db.commit()
