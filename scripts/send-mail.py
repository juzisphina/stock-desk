"""Send out/email.html via SMTP (default Gmail). Env: MAIL_USERNAME, MAIL_PASSWORD (Gmail app password),
MAIL_TO (optional, comma separated; defaults to MAIL_USERNAME), SMTP_HOST, SMTP_PORT."""
import os, smtplib, ssl
from email.mime.text import MIMEText
from email.header import Header
from pathlib import Path

root = Path(__file__).resolve().parent.parent
user = os.environ["MAIL_USERNAME"]
pwd = os.environ["MAIL_PASSWORD"]
to = [a.strip() for a in (os.environ.get("MAIL_TO") or user).split(",") if a.strip()]
host = os.environ.get("SMTP_HOST") or "smtp.gmail.com"
port = int(os.environ.get("SMTP_PORT") or 465)

msg = MIMEText((root / "out" / "email.html").read_text(encoding="utf-8"), "html", "utf-8")
msg["Subject"] = Header((root / "out" / "subject.txt").read_text(encoding="utf-8").strip(), "utf-8")
msg["From"] = user
msg["To"] = ", ".join(to)

if port == 465:
    with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context()) as s:
        s.login(user, pwd)
        s.sendmail(user, to, msg.as_string())
else:
    with smtplib.SMTP(host, port) as s:
        s.starttls(context=ssl.create_default_context())
        s.login(user, pwd)
        s.sendmail(user, to, msg.as_string())
print(f"sent to {len(to)} recipient(s)")
