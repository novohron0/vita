"""Vita — сайт-генератор обоев «жизнь в точках» + персональные ссылки для автообоев."""
import io
import json
import secrets
import sqlite3
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
SHORTCUT_ICLOUD_URL = ""


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS links("
        "code TEXT PRIMARY KEY, config TEXT NOT NULL, "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    for col in ("fetches INTEGER NOT NULL DEFAULT 0", "last_fetch TEXT"):
        try:
            conn.execute(f"ALTER TABLE links ADD COLUMN {col}")
        except sqlite3.OperationalError:
            pass  # колонка уже есть
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


app = FastAPI(title="vita")


@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.post("/api/link")
def create_link(cfg: LinkIn, request: Request):
    code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
    with db() as conn:
        conn.execute(
            "INSERT INTO links(code, config) VALUES(?, ?)",
            (code, cfg.model_dump_json()),
        )
    base = str(request.base_url).rstrip("/")
    return {"code": code, "url": f"{base}/w/{code}.png", "setup": f"{base}/s/{code}"}


@app.get("/s/{code}")
def setup_page(code: str, request: Request):
    with db() as conn:
        row = conn.execute("SELECT 1 FROM links WHERE code = ?", (code,)).fetchone()
    if row is None:
        raise HTTPException(404, "Нет такой ссылки")
    url = str(request.base_url).rstrip("/") + f"/w/{code}.png"
    if SHORTCUT_ICLOUD_URL:
        btn = f'<a class="btn primary" href="{SHORTCUT_ICLOUD_URL}">Добавить ярлык</a>'
    else:
        btn = '<span class="btn primary disabled">Ярлык готовится — скоро здесь</span>'
    html = (ROOT / "static" / "setup.html").read_text(encoding="utf-8")
    return HTMLResponse(html.replace("{{URL}}", url).replace("{{SHORTCUT_BTN}}", btn))


@app.get("/w/{code}.png")
def wallpaper(code: str):
    with db() as conn:
        row = conn.execute("SELECT config FROM links WHERE code = ?", (code,)).fetchone()
        if row is not None:
            conn.execute(
                "UPDATE links SET fetches = fetches + 1, last_fetch = datetime('now') WHERE code = ?",
                (code,),
            )
    if row is None:
        raise HTTPException(404, "Нет такой ссылки")
    img = render_wallpaper(json.loads(row[0]))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Response(
        buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},  # Ярлыки должны тянуть свежую картинку каждый день
    )


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
