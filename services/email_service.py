import logging
import smtplib
import ssl
from email.message import EmailMessage

from config import (
    SMTP_FROM_EMAIL,
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USE_SSL,
    SMTP_USE_TLS,
    SMTP_USER,
)

logger = logging.getLogger(__name__)


def email_delivery_configured() -> bool:
    return bool(SMTP_HOST and SMTP_FROM_EMAIL and SMTP_PORT)


def _purpose_labels(purpose: str) -> tuple[str, str]:
    normalized = (purpose or "login").strip().lower()
    if normalized == "register":
        return "Kayit dogrulama", "Deprem Risk Izleyici kayit dogrulama kodunuz"
    if normalized == "reset":
        return "Sifre sifirlama", "Deprem Risk Izleyici sifre sifirlama kodunuz"
    return "Giris dogrulama", "Deprem Risk Izleyici giris dogrulama kodunuz"


def _build_message(target_email: str, code: str, purpose: str) -> EmailMessage:
    subject_prefix, intro = _purpose_labels(purpose)
    message = EmailMessage()
    message["Subject"] = f"{subject_prefix} kodu"
    message["From"] = (
        f"{SMTP_FROM_NAME} <{SMTP_FROM_EMAIL}>"
        if SMTP_FROM_NAME
        else SMTP_FROM_EMAIL
    )
    message["To"] = target_email
    message.set_content(
        (
            f"{intro}: {code}\n\n"
            "Kod 5 dakika boyunca gecerlidir.\n"
            "Bu islemi siz baslatmadiysaniz bu e-postayi yok sayabilirsiniz.\n"
        ),
        charset="utf-8",
    )
    return message


def send_verification_email(target_email: str, code: str, *, purpose: str = "login") -> tuple[bool, str]:
    if not email_delivery_configured():
        return False, "SMTP ayarlari eksik"

    message = _build_message(target_email.strip().lower(), code.strip(), purpose)
    context = ssl.create_default_context()

    try:
        if SMTP_USE_SSL:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20, context=context) as client:
                if SMTP_USER:
                    client.login(SMTP_USER, SMTP_PASSWORD)
                client.send_message(message)
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as client:
                if SMTP_USE_TLS:
                    client.starttls(context=context)
                if SMTP_USER:
                    client.login(SMTP_USER, SMTP_PASSWORD)
                client.send_message(message)
    except Exception as exc:
        logger.exception("SMTP ile dogrulama e-postasi gonderilemedi: %s", exc)
        return False, "Dogrulama e-postasi gonderilemedi"

    return True, "Dogrulama e-postasi gonderildi"
