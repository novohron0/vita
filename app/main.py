"""Vita — сайт-генератор обоев «жизнь в точках» + персональные ссылки для автообоев."""
import io
import json
import os
import secrets
import sqlite3
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .render import render_wallpaper

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
DB_PATH = DATA / "vita.db"

CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

# Ссылка iCloud на мастер-ярлык «Vita» (создаётся один раз на iPhone владельца,
# см. README). Пока пусто — на странице установки кнопка в состоянии «готовится».
SHORTCUT_ICLOUD_URL = os.environ.get("SHORTCUT_ICLOUD_URL", "")

TRIAL_DAYS = 7
# токен админки: /admin?token=... — боевой задаётся в .env, не публиковать
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "vt-dev")


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS links("
        "code TEXT PRIMARY KEY, config TEXT NOT NULL, "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    for col in ("fetches INTEGER NOT NULL DEFAULT 0", "last_fetch TEXT", "access_until TEXT"):
        try:
            conn.execute(f"ALTER TABLE links ADD COLUMN {col}")
        except sqlite3.OperationalError:
            pass  # колонка уже есть
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ideas("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, "
        "idea TEXT NOT NULL, contact TEXT NOT NULL, "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    return conn


class LinkIn(BaseModel):
    mode: str = "month"
    color: str = "#f2f2f2"
    bg: str = "black"
    shape: str = "circle"
    title: str = ""
    footer: bool = True
    birth: str = "2000-01-01"
    start: str = ""
    end: str = ""
    idea: str = ""
    contact: str = ""


app = FastAPI(title="vita")


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.post("/api/link")
def create_link(cfg: LinkIn, request: Request):
    idea, contact = cfg.idea.strip(), cfg.contact.strip()
    if len(idea) < 10:
        raise HTTPException(422, "Расскажи идею чуть подробнее — хотя бы пару слов")
    if len(contact) < 2:
        raise HTTPException(422, "Оставь телегу или инсту — туда придёт вторая неделя")
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
    until = (date.today() + timedelta(days=TRIAL_DAYS)).isoformat()
    config = json.dumps(cfg.model_dump(exclude={"idea", "contact"}), ensure_ascii=False)
    with db() as conn:
        conn.execute(
            "INSERT INTO links(code, config, access_until) VALUES(?, ?, ?)",
            (code, config, until),
        )
        conn.execute(
            "INSERT INTO ideas(code, idea, contact) VALUES(?, ?, ?)",
            (code, idea, contact),
        )
    base = str(request.base_url).rstrip("/")
    return {"code": code, "url": f"{base}/w/{code}.png", "setup": f"{base}/s/{code}", "until": until}


def _access_state(access_until: str | None) -> tuple[bool, date | None]:
    """(доступ истёк, дата заморозки). NULL = бессрочный доступ."""
    if not access_until:
        return False, None
    try:
        until = date.fromisoformat(access_until)
    except ValueError:
        return False, None
    return date.today() > until, until


@app.get("/s/{code}")
def setup_page(code: str, request: Request):
    with db() as conn:
        row = conn.execute("SELECT access_until FROM links WHERE code = ?", (code,)).fetchone()
    if row is None:
        raise HTTPException(404, "Нет такой ссылки")
    url = str(request.base_url).rstrip("/") + f"/w/{code}.png"
    if SHORTCUT_ICLOUD_URL:
        btn = f'<a class="btn primary" href="{SHORTCUT_ICLOUD_URL}">Добавить ярлык</a>'
    else:
        btn = '<span class="btn primary disabled">Ярлык готовится — скоро здесь</span>'
    expired, until = _access_state(row[0])
    if until is None:
        access = ""
    elif expired:
        access = f"Доступ закончился {until.strftime('%d.%m')} — продли, и точки оживут."
    else:
        access = f"Твоя неделя активна до {until.strftime('%d.%m')}."
    html = (ROOT / "static" / "setup.html").read_text(encoding="utf-8")
    return HTMLResponse(
        html.replace("{{URL}}", url).replace("{{SHORTCUT_BTN}}", btn).replace("{{ACCESS}}", access)
    )


@app.get("/w/{code}.png")
def wallpaper(code: str):
    with db() as conn:
        row = conn.execute(
            "SELECT config, access_until FROM links WHERE code = ?", (code,)
        ).fetchone()
        if row is not None:
            conn.execute(
                "UPDATE links SET fetches = fetches + 1, last_fetch = datetime('now') WHERE code = ?",
                (code,),
            )
    if row is None:
        raise HTTPException(404, "Нет такой ссылки")
    expired, until = _access_state(row[1])
    img = render_wallpaper(
        json.loads(row[0]),
        today=until if expired else None,  # прогресс заморожен на дате окончания
        expired=expired,
    )
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Response(
        buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},  # Ярлыки должны тянуть свежую картинку каждый день
    )


# --- админка (первая сотня управляется руками) ---

ADMIN_PAGE = """<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Vita — админка</title>
<style>
body {{ background:#000; color:#f2f2f2; font: 14px -apple-system, system-ui, sans-serif; padding: 16px; }}
h1 {{ font-size: 20px; margin-bottom: 14px; }}
.card {{ background:#101012; border:1px solid #232326; border-radius: 14px; padding: 14px; margin-bottom: 12px; }}
.idea {{ font-size: 15px; line-height: 1.45; margin: 6px 0 10px; }}
.meta {{ color:#8e8e8e; font-size: 12px; display:flex; gap:12px; flex-wrap:wrap; }}
.meta b {{ color:#d9d9de; }}
.row {{ display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }}
button {{ background:#232326; color:#f2f2f2; border:0; border-radius:9px; padding:7px 12px; font:inherit; cursor:pointer; }}
button:hover {{ background:#2f2f33; }}
.expired {{ color:#ff6b81; }}
a {{ color:#7fd4a3; }}
</style></head><body><h1>⠿ vita — идеи ({count})</h1>{cards}
<script>
async function ext(code, days) {{
  await fetch(`/admin/extend?token={token}&code=${{code}}&days=${{days}}`, {{ method: 'POST' }});
  location.reload();
}}
</script></body></html>"""


@app.get("/admin")
def admin(token: str = ""):
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "Нет доступа")
    with db() as conn:
        rows = conn.execute(
            "SELECT i.created, i.idea, i.contact, l.code, l.access_until, l.fetches "
            "FROM ideas i JOIN links l ON l.code = i.code ORDER BY i.id DESC"
        ).fetchall()
    cards = []
    for created, idea, contact, code, access_until, fetches in rows:
        expired, until = _access_state(access_until)
        if until is None:
            status = "навсегда"
        elif expired:
            status = f'<span class="expired">истёк {until.strftime("%d.%m")}</span>'
        else:
            status = f"до {until.strftime('%d.%m')}"
        cards.append(
            f'<div class="card"><div class="meta"><span>{created}</span>'
            f'<span>контакт: <b>{contact}</b></span>'
            f'<span>доступ: {status}</span><span>скачиваний: {fetches}</span>'
            f'<a href="/w/{code}.png" target="_blank">{code}</a></div>'
            f'<div class="idea">{idea}</div>'
            f'<div class="row"><button onclick="ext(\'{code}\', 7)">+7 дней</button>'
            f'<button onclick="ext(\'{code}\', 30)">+месяц</button>'
            f'<button onclick="ext(\'{code}\', 3650)">навсегда</button></div></div>'
        )
    html = ADMIN_PAGE.format(count=len(rows), cards="".join(cards) or "<p>Пока пусто.</p>", token=ADMIN_TOKEN)
    return HTMLResponse(html)


@app.post("/admin/extend")
def admin_extend(code: str, days: int, token: str = ""):
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "Нет доступа")
    with db() as conn:
        row = conn.execute("SELECT access_until FROM links WHERE code = ?", (code,)).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такой ссылки")
        _, until = _access_state(row[0])
        base = max(date.today(), until) if until else date.today()
        new_until = (base + timedelta(days=days)).isoformat()
        conn.execute("UPDATE links SET access_until = ? WHERE code = ?", (new_until, code))
    return {"code": code, "access_until": new_until}


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
