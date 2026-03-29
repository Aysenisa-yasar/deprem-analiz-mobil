# SQLite: mobil kullanıcılar, mesajlar, deprem uyarısı tekil kayıtları
import os
import sqlite3
import threading
import uuid
from typing import Any, Optional

from werkzeug.security import check_password_hash, generate_password_hash

from config import DATA_DIR

_db_lock = threading.Lock()
DB_PATH = os.path.join(DATA_DIR, "mobile_social.db")


def _conn() -> sqlite3.Connection:
    os.makedirs(DATA_DIR, exist_ok=True)
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


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
                    created_at REAL DEFAULT (strftime('%s','now'))
                );
                CREATE INDEX IF NOT EXISTS idx_msg_to ON mobile_messages(to_user, id DESC);
                CREATE INDEX IF NOT EXISTS idx_msg_from ON mobile_messages(from_user, id DESC);
                CREATE TABLE IF NOT EXISTS mobile_alert_log (
                    username TEXT NOT NULL COLLATE NOCASE,
                    event_key TEXT NOT NULL,
                    created_at REAL DEFAULT (strftime('%s','now')),
                    PRIMARY KEY (username, event_key)
                );
                """
            )
            db.commit()


def register_user(username: str, password: str) -> tuple[bool, str]:
    init_mobile_db()
    if not _valid_username(username):
        return False, "Geçersiz kullanıcı adı (3–32 karakter, harf/rakam/_)"
    if len(password) < 4:
        return False, "Şifre en az 4 karakter olmalı"
    ph = generate_password_hash(password)
    tok = uuid.uuid4().hex
    with _db_lock:
        try:
            with _conn() as db:
                db.execute(
                    "INSERT INTO mobile_users (username, password_hash, token) VALUES (?, ?, ?)",
                    (username.strip(), ph, tok),
                )
                db.commit()
        except sqlite3.IntegrityError:
            return False, "Bu kullanıcı adı alınmış"
    return True, tok


def login_user(username: str, password: str) -> Optional[str]:
    init_mobile_db()
    with _db_lock:
        with _conn() as db:
            row = db.execute(
                "SELECT password_hash, token FROM mobile_users WHERE username = ? COLLATE NOCASE",
                (username.strip(),),
            ).fetchone()
            if not row:
                return None
            if not check_password_hash(row["password_hash"], password):
                return None
            new_tok = uuid.uuid4().hex
            db.execute(
                "UPDATE mobile_users SET token = ? WHERE username = ? COLLATE NOCASE",
                (new_tok, username.strip()),
            )
            db.commit()
            return new_tok


def user_from_token(token: str) -> Optional[dict[str, Any]]:
    if not token:
        return None
    init_mobile_db()
    with _db_lock:
        with _conn() as db:
            row = db.execute(
                """
                SELECT username, emergency_contact FROM mobile_users
                WHERE token = ?
                """,
                (token.strip(),),
            ).fetchone()
            if not row:
                return None
            return {"username": row["username"], "emergency_contact": row["emergency_contact"]}


def set_emergency_contact(username: str, contact_username: Optional[str]) -> tuple[bool, str]:
    init_mobile_db()
    contact_username = (contact_username or "").strip()
    if not contact_username:
        with _db_lock:
            with _conn() as db:
                db.execute(
                    "UPDATE mobile_users SET emergency_contact = NULL WHERE username = ? COLLATE NOCASE",
                    (username,),
                )
                db.commit()
        return True, ""
    if not _valid_username(contact_username):
        return False, "Geçersiz acil kullanıcı adı"
    if contact_username.lower() == username.lower():
        return False, "Kendinizi acil kişi olarak seçemezsiniz"
    with _db_lock:
        with _conn() as db:
            ex = db.execute(
                "SELECT 1 FROM mobile_users WHERE username = ? COLLATE NOCASE",
                (contact_username,),
            ).fetchone()
            if not ex:
                return False, "Acil kişi kayıtlı bir kullanıcı olmalı"
            db.execute(
                "UPDATE mobile_users SET emergency_contact = ? WHERE username = ? COLLATE NOCASE",
                (contact_username, username),
            )
            db.commit()
    return True, ""


def send_user_message(from_user: str, to_user: str, body: str) -> tuple[bool, str]:
    body = (body or "").strip()
    if not body or len(body) > 4000:
        return False, "Mesaj boş veya çok uzun (max 4000)"
    init_mobile_db()
    to_user = to_user.strip()
    if not _valid_username(to_user):
        return False, "Geçersiz alıcı"
    with _db_lock:
        with _conn() as db:
            ex = db.execute(
                "SELECT 1 FROM mobile_users WHERE username = ? COLLATE NOCASE",
                (to_user,),
            ).fetchone()
            if not ex:
                return False, "Alıcı bulunamadı"
            db.execute(
                """
                INSERT INTO mobile_messages (from_user, to_user, body, kind)
                VALUES (?, ?, ?, 'user')
                """,
                (from_user, to_user, body),
            )
            db.commit()
    return True, ""


def fetch_messages(
    username: str, since_id: int = 0, limit: int = 100
) -> list[dict[str, Any]]:
    init_mobile_db()
    limit = min(max(1, limit), 200)
    with _db_lock:
        with _conn() as db:
            rows = db.execute(
                """
                SELECT id, from_user, to_user, body, kind, created_at
                FROM mobile_messages
                WHERE (to_user = ? COLLATE NOCASE OR from_user = ? COLLATE NOCASE)
                  AND id > ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (username, username, since_id, limit),
            ).fetchall()
    return [dict(r) for r in rows]


def try_record_alert(username: str, event_key: str) -> bool:
    """True if this is a new alert to send, False if duplicate."""
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


def _valid_username(u: str) -> bool:
    u = u.strip()
    if len(u) < 3 or len(u) > 32:
        return False
    for ch in u:
        if ch.isalnum() or ch == "_":
            continue
        return False
    return True


def add_system_message(from_user: str, to_user: str, body: str, kind: str) -> None:
    init_mobile_db()
    with _db_lock:
        with _conn() as db:
            db.execute(
                """
                INSERT INTO mobile_messages (from_user, to_user, body, kind)
                VALUES (?, ?, ?, ?)
                """,
                (from_user, to_user, body, kind),
            )
            db.commit()
