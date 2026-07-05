"""Vita — сайт-генератор обоев «жизнь в точках» + персональные ссылки для автообоев."""
import io
import json
import secrets
import sqlite3
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .render import render_wallpaper

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
DB_PATH = DATA / "vita.db"

CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS links("
        "code TEXT PRIMARY KEY, config TEXT NOT NULL, "
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
    return {"code": code, "url": str(request.base_url).rstrip("/") + f"/w/{code}.png"}


@app.get("/w/{code}.png")
def wallpaper(code: str):
    with db() as conn:
        row = conn.execute("SELECT config FROM links WHERE code = ?", (code,)).fetchone()
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
