"""Vita — сайт-генератор обоев «жизнь в точках» + персональные ссылки для автообоев."""
import io
import json
import os
import secrets
import sqlite3
from datetime import date, timedelta
from html import escape as esc
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .render import render_goal, render_wallpaper

ROOT = Path(__file__).resolve().parent.parent
# VITA_DATA — переопределение каталога данных (dev/тесты не трогают боевую БД)
DATA = Path(os.environ.get("VITA_DATA") or (ROOT / "data"))
DATA.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA / "vita.db"

CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

# Ссылка iCloud на мастер-ярлык «Vita» (создаётся один раз на iPhone владельца,
# см. README). Пока пусто — на странице установки кнопка в состоянии «готовится».
SHORTCUT_ICLOUD_URL = os.environ.get("SHORTCUT_ICLOUD_URL", "")

TRIAL_DAYS = 7
REVIEW_DAYS = 7  # вторая неделя — автоматом за отзыв после использования
# токен админки: /admin?token=... — боевой задаётся в .env, не публиковать
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "vt-dev")


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS links("
        "code TEXT PRIMARY KEY, config TEXT NOT NULL, "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    for col in (
        "fetches INTEGER NOT NULL DEFAULT 0",
        "last_fetch TEXT",
        "access_until TEXT",
        "review_at TEXT",  # когда получена вторая неделя за отзыв (одноразово)
    ):
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
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reviews("
        "id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, "
        "text TEXT NOT NULL, "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    # трекер целей «тыкалка»: цель + отметки дней (checkins)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS goals("
        "code TEXT PRIMARY KEY, title TEXT NOT NULL, days INTEGER NOT NULL, "
        "start TEXT NOT NULL, reward TEXT NOT NULL DEFAULT '', "
        "color TEXT NOT NULL DEFAULT '#34c759', bg TEXT NOT NULL DEFAULT 'black', "
        "shape TEXT NOT NULL DEFAULT 'circle', "
        "created TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS checkins("
        "code TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(code, day))"
    )
    try:
        conn.execute("ALTER TABLE goals ADD COLUMN root TEXT")  # корень челленджа (NULL = сам себе корень)
    except sqlite3.OperationalError:
        pass
    # вейтлист беты Vita Focus (contact = телега/инста, PRIMARY KEY даёт дедуп)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS focus_wait("
        "contact TEXT PRIMARY KEY, "
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
    brand: bool = True  # лого vita на обоях; в render.py уже есть cfg.get("brand", True)
    birth: str = "2000-01-01"
    start: str = ""
    end: str = ""
    idea: str = ""
    contact: str = ""


class ReviewIn(BaseModel):
    code: str
    text: str = ""


class GoalIn(BaseModel):
    title: str = ""
    days: int = 30
    reward: str = ""
    color: str = "#34c759"
    bg: str = "black"
    shape: str = "circle"
    start: str = ""


class CheckIn(BaseModel):
    day: str = ""


class FocusWaitIn(BaseModel):
    contact: str = ""


def _gen_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


def _valid_color(c: str) -> bool:
    return isinstance(c, str) and len(c) == 7 and c[0] == "#" and all(
        ch in "0123456789abcdefABCDEF" for ch in c[1:]
    )


app = FastAPI(title="vita")


@app.get("/")
def index():
    # HTML не кэшируем: статика версионируется (?v=N), а страница всегда свежая
    return FileResponse(ROOT / "static" / "index.html", headers={"Cache-Control": "no-cache"})


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


@app.post("/api/review")
def create_review(rv: ReviewIn):
    text = rv.text.strip()
    if len(text) < 15:
        raise HTTPException(422, "Напиши чуть подробнее — хотя бы строчку живого текста")
    with db() as conn:
        row = conn.execute(
            "SELECT access_until, review_at FROM links WHERE code = ?", (rv.code,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такой ссылки")
        if row[1]:  # вторую неделю уже дарили
            raise HTTPException(409, "Вторая неделя уже активирована — спасибо, что остаёшься 🙏")
        conn.execute("INSERT INTO reviews(code, text) VALUES(?, ?)", (rv.code, text))
        conn.execute(
            "UPDATE links SET review_at = datetime('now') WHERE code = ?", (rv.code,)
        )
        new_until = _extend(conn, rv.code, REVIEW_DAYS, row[0])
    until_d = date.fromisoformat(new_until)
    return {"code": rv.code, "until": new_until, "until_h": until_d.strftime("%d.%m")}


def _access_state(access_until: str | None) -> tuple[bool, date | None]:
    """(доступ истёк, дата заморозки). NULL = бессрочный доступ."""
    if not access_until:
        return False, None
    try:
        until = date.fromisoformat(access_until)
    except ValueError:
        return False, None
    return date.today() > until, until


def _extend(conn: sqlite3.Connection, code: str, days: int, current: str | None) -> str:
    """Продлить доступ от максимума (сегодня, текущий срок). Возвращает новую дату ISO."""
    _, until = _access_state(current)
    base = max(date.today(), until) if until else date.today()
    new_until = (base + timedelta(days=days)).isoformat()
    conn.execute("UPDATE links SET access_until = ? WHERE code = ?", (new_until, code))
    return new_until


REVIEW_BLOCK = """<div class="review" id="reviewBlock">
  <h3>Открой вторую неделю — бесплатно</h3>
  <p class="hint">Расскажи, как тебе Vita: для чего используешь, что зацепило, чего не хватает.
    Пара живых фраз — и мы дарим ещё 7 дней.</p>
  <textarea id="reviewText" rows="4"
    placeholder="Например: наконец вижу, сколько недель уже прожито — отрезвляет и бодрит одновременно…"></textarea>
  <button id="reviewSend" class="btn primary">Отправить и получить +7 дней</button>
  <p class="hint err" id="reviewStatus"></p>
</div>"""

REVIEW_DONE = """<div class="review">
  <h3>Спасибо за отзыв 🙏</h3>
  <p class="hint">Вторая неделя уже активна. Точки живут дальше.</p>
</div>"""


@app.get("/s/{code}")
def setup_page(code: str, request: Request):
    with db() as conn:
        row = conn.execute(
            "SELECT access_until, fetches, review_at FROM links WHERE code = ?", (code,)
        ).fetchone()
    if row is None:
        raise HTTPException(404, "Нет такой ссылки")
    access_until, fetches, review_at = row
    url = str(request.base_url).rstrip("/") + f"/w/{code}.png"
    if SHORTCUT_ICLOUD_URL:
        btn = f'<a class="btn primary" href="{SHORTCUT_ICLOUD_URL}">Добавить ярлык</a>'
    else:
        btn = '<span class="btn primary disabled">Ярлык готовится — скоро здесь</span>'
    expired, until = _access_state(access_until)
    if until is None:
        access = ""
    elif expired:
        access = f"Доступ закончился {until.strftime('%d.%m')} — продли, и точки оживут."
    else:
        access = f"Твоя неделя активна до {until.strftime('%d.%m')}."
    # блок отзыва: только тем, кто уже пользовался (обои реально тянулись) или у кого доступ истёк,
    # и только если вторую неделю ещё не дарили — иначе пусто/благодарность
    if review_at:
        review = REVIEW_DONE
    elif fetches and fetches > 0 or expired:
        review = REVIEW_BLOCK
    else:
        review = ""
    html = (ROOT / "static" / "setup.html").read_text(encoding="utf-8")
    return HTMLResponse(
        html.replace("{{URL}}", url)
        .replace("{{SHORTCUT_BTN}}", btn)
        .replace("{{ACCESS}}", access)
        .replace("{{REVIEW}}", review)
        .replace("{{CODE}}", code),
        headers={"Cache-Control": "no-cache"},
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


# --- трекер целей «тыкалка» (клон Ripples, чисто веб) ---


@app.get("/goals")
def goals_new():
    return FileResponse(ROOT / "static" / "goals.html", headers={"Cache-Control": "no-cache"})


@app.get("/focus")
def focus_page():
    return FileResponse(ROOT / "static" / "focus.html", headers={"Cache-Control": "no-cache"})


@app.post("/api/focus-wait")
def focus_wait(fw: FocusWaitIn):
    """Вейтлист беты Vita Focus: телега/инста. Повторная отправка — тоже ок (дедуп по contact)."""
    contact = fw.contact.strip()
    if len(contact) < 2:
        raise HTTPException(422, "Оставь телегу или инсту — туда позовём в бету")
    with db() as conn:
        conn.execute("INSERT OR IGNORE INTO focus_wait(contact) VALUES(?)", (contact[:64],))
    return {"ok": True}


@app.get("/feed")
def feed_page():
    return FileResponse(ROOT / "static" / "feed.html", headers={"Cache-Control": "no-cache"})


@app.get("/api/feed")
def feed_list():
    """Лента челленджей: только те, что кто-то реально подхватил (peers >= 2 — значит,
    цель шарили и она живёт). Группируем копии по корню, самые популярные — выше."""
    with db() as conn:
        rows = conn.execute(
            "SELECT g.code, g.title, g.days, g.color, g.shape, cnt.peers "
            "FROM (SELECT COALESCE(root, code) AS rc, COUNT(*) AS peers "
            "      FROM goals GROUP BY rc) cnt "
            "JOIN goals g ON g.code = cnt.rc "
            "WHERE cnt.peers >= 2 "
            "ORDER BY cnt.peers DESC, g.created DESC LIMIT 60"
        ).fetchall()
    return {
        "items": [
            {"code": c, "title": t, "days": d, "color": col, "shape": sh, "peers": p}
            for c, t, d, col, sh, p in rows
        ]
    }


@app.post("/api/goal")
def create_goal(g: GoalIn, request: Request):
    title = g.title.strip()
    if len(title) < 2:
        raise HTTPException(422, "Назови цель — хотя бы пару слов")
    days = min(max(int(g.days), 1), 365)
    start = _parse_start(g.start)
    color = g.color if _valid_color(g.color) else "#34c759"
    bg = g.bg if g.bg in ("black", "white", "navy") else "black"
    shape = g.shape if g.shape in ("circle", "rounded", "square") else "circle"
    code = _gen_code()
    with db() as conn:
        conn.execute(
            "INSERT INTO goals(code, title, days, start, reward, color, bg, shape) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
            (code, title[:80], days, start, g.reward.strip()[:200], color, bg, shape),
        )
    base = str(request.base_url).rstrip("/")
    return {"code": code, "url": f"{base}/g/{code}"}


def _parse_start(value: str) -> str:
    try:
        return date.fromisoformat(value).isoformat()
    except (ValueError, TypeError):
        return date.today().isoformat()


def _goal_row(code: str):
    with db() as conn:
        g = conn.execute(
            "SELECT code, title, days, start, reward, color, bg, shape, root FROM goals WHERE code = ?",
            (code,),
        ).fetchone()
        done = [r[0] for r in conn.execute(
            "SELECT day FROM checkins WHERE code = ? ORDER BY day", (code,)
        )]
    return g, done


def _peers(code: str, root: str | None) -> int:
    """Сколько всего людей делают этот челлендж (включая корень и все копии)."""
    key = root or code
    with db() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM goals WHERE COALESCE(root, code) = ?", (key,)
        ).fetchone()[0]


@app.get("/g/{code}")
def goal_page(code: str):
    g, _ = _goal_row(code)
    if g is None:
        raise HTTPException(404, "Нет такой цели")
    html = (ROOT / "static" / "goal.html").read_text(encoding="utf-8")
    return HTMLResponse(
        html.replace("{{CODE}}", code).replace("{{SHORTCUT_URL}}", SHORTCUT_ICLOUD_URL),
        headers={"Cache-Control": "no-cache"},
    )


@app.get("/c/{code}")
def challenge_page(code: str):
    g, _ = _goal_row(code)
    if g is None:
        raise HTTPException(404, "Нет такой цели")
    html = (ROOT / "static" / "challenge.html").read_text(encoding="utf-8")
    return HTMLResponse(html.replace("{{CODE}}", code), headers={"Cache-Control": "no-cache"})


@app.get("/api/goal/{code}")
def goal_state(code: str):
    g, done = _goal_row(code)
    if g is None:
        raise HTTPException(404, "Нет такой цели")
    _, title, days, start, reward, color, bg, shape, root = g
    return {
        "title": title, "days": days, "start": start, "reward": reward,
        "color": color, "bg": bg, "shape": shape, "done": done,
        "peers": _peers(code, root),
    }


@app.post("/api/goal/{code}/toggle")
def goal_toggle(code: str, ci: CheckIn):
    g, _ = _goal_row(code)
    if g is None:
        raise HTTPException(404, "Нет такой цели")
    _, _, days, start, *_ = g
    try:
        day = date.fromisoformat(ci.day)
        start_d = date.fromisoformat(start)
    except (ValueError, TypeError):
        raise HTTPException(422, "Некорректная дата")
    # отмечать можно только дни в пределах цели и не в будущем
    if not (start_d <= day <= start_d + timedelta(days=days - 1)):
        raise HTTPException(422, "День вне цели")
    if day > date.today():
        raise HTTPException(422, "Будущее ещё не прожито 🙂")
    with db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM checkins WHERE code = ? AND day = ?", (code, ci.day)
        ).fetchone()
        if exists:
            conn.execute("DELETE FROM checkins WHERE code = ? AND day = ?", (code, ci.day))
            return {"done": False}
        conn.execute("INSERT INTO checkins(code, day) VALUES(?, ?)", (code, ci.day))
    return {"done": True}


@app.post("/api/goal/{code}/join")
def goal_join(code: str, request: Request):
    with db() as conn:
        row = conn.execute(
            "SELECT title, days, color, bg, shape, root FROM goals WHERE code = ?", (code,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такой цели")
        title, days, color, bg, shape, root = row
        newcode = _gen_code()
        conn.execute(
            "INSERT INTO goals(code, title, days, start, reward, color, bg, shape, root) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (newcode, title, days, date.today().isoformat(), "", color, bg, shape, root or code),
        )
    base = str(request.base_url).rstrip("/")
    return {"code": newcode, "url": f"{base}/g/{newcode}"}


@app.get("/gw/{code}.png")
def goal_wallpaper(code: str):
    g, done = _goal_row(code)
    if g is None:
        raise HTTPException(404, "Нет такой цели")
    _, title, days, start, reward, color, bg, shape, _root = g
    img = render_goal(
        {"title": title, "days": days, "start": start,
         "color": color, "bg": bg, "shape": shape},
        set(done),
    )
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return Response(
        buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},  # каждый день/после отметки — свежая картинка
    )


# --- админка (первая сотня управляется руками) ---

ADMIN_PAGE = """<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Vita — админка</title>
<style>
body {{ background:#000; color:#f2f2f2; font: 14px -apple-system, system-ui, sans-serif; padding: 16px; }}
h1 {{ font-size: 20px; margin-bottom: 14px; }}
.card {{ background:#101012; border:1px solid #232326; border-radius: 14px; padding: 14px; margin-bottom: 12px; }}
.idea {{ font-size: 15px; line-height: 1.45; margin: 6px 0 10px; }}
.review-q {{ font-size: 14px; line-height: 1.45; margin: 8px 0 4px; padding: 8px 12px;
  background:#0d1a12; border-left:2px solid #7fd4a3; border-radius:0 8px 8px 0; color:#cbe9d7; }}
.review-q::before {{ content:"отзыв · "; color:#7fd4a3; font-weight:600; }}
.meta {{ color:#8e8e8e; font-size: 12px; display:flex; gap:12px; flex-wrap:wrap; }}
.meta b {{ color:#d9d9de; }}
.row {{ display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }}
button {{ background:#232326; color:#f2f2f2; border:0; border-radius:9px; padding:7px 12px; font:inherit; cursor:pointer; }}
button:hover {{ background:#2f2f33; }}
button.copy {{ background:#12261a; color:#7fd4a3; }}
button.copy:hover {{ background:#173324; }}
button.copy.done {{ background:#1f7a4d; color:#fff; }}
.expired {{ color:#ff6b81; }}
a {{ color:#7fd4a3; }}
</style></head><body><h1>⠿ vita — идеи ({count})</h1>{cards}
<script>
async function ext(code, days) {{
  await fetch(`/admin/extend?token={token}&code=${{code}}&days=${{days}}`, {{ method: 'POST' }});
  location.reload();
}}
async function copyCard(btn) {{
  const text = btn.dataset.copy;
  try {{
    await navigator.clipboard.writeText(text);
  }} catch (e) {{
    // Safari/HTTP-фолбэк: скрытая textarea + execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }}
  const label = btn.textContent;
  btn.textContent = '✓ скопировано';
  btn.classList.add('done');
  setTimeout(() => {{ btn.textContent = label; btn.classList.remove('done'); }}, 1500);
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
        rv_rows = conn.execute(
            "SELECT code, text FROM reviews ORDER BY id"
        ).fetchall()
        fw_rows = conn.execute(
            "SELECT contact, created FROM focus_wait ORDER BY created DESC"
        ).fetchall()
    reviews: dict[str, list[str]] = {}
    for r_code, r_text in rv_rows:
        reviews.setdefault(r_code, []).append(r_text)
    cards = []
    for created, idea, contact, code, access_until, fetches in rows:
        expired, until = _access_state(access_until)
        if until is None:
            status = "навсегда"
            status_txt = "навсегда"
        elif expired:
            status = f'<span class="expired">истёк {until.strftime("%d.%m")}</span>'
            status_txt = f"истёк {until.strftime('%d.%m')}"
        else:
            status = f"до {until.strftime('%d.%m')}"
            status_txt = status
        card_reviews = reviews.get(code, [])
        review_html = "".join(
            f'<div class="review-q">{esc(t)}</div>' for t in card_reviews
        )
        # текст для кнопки «копировать» — чтобы владелец одним тапом кидал идею мне
        copy_lines = [
            f"Vita · идея (код {code})",
            f"Идея: {idea}",
            f"Контакт: {contact}",
            f"Дата: {created} · доступ: {status_txt} · скачиваний: {fetches}",
        ]
        for t in card_reviews:
            copy_lines.append(f"Отзыв: {t}")
        copy_text = "\n".join(copy_lines)
        cards.append(
            f'<div class="card"><div class="meta"><span>{created}</span>'
            f'<span>контакт: <b>{esc(contact)}</b></span>'
            f'<span>доступ: {status}</span><span>скачиваний: {fetches}</span>'
            f'<a href="/w/{code}.png" target="_blank">{code}</a></div>'
            f'<div class="idea">{esc(idea)}</div>{review_html}'
            f'<div class="row">'
            f'<button class="copy" data-copy="{esc(copy_text)}" onclick="copyCard(this)">⧉ Копировать</button>'
            f'<button onclick="ext(\'{code}\', 7)">+7 дней</button>'
            f'<button onclick="ext(\'{code}\', 30)">+месяц</button>'
            f'<button onclick="ext(\'{code}\', 3650)">навсегда</button></div></div>'
        )
    # вейтлист беты Vita Focus — карточкой над идеями (виден только когда кто-то записался)
    focus_block = ""
    if fw_rows:
        items = "".join(
            f'<div>{esc(c)} <span style="color:#8e8e8e">· {cr}</span></div>' for c, cr in fw_rows
        )
        focus_block = (
            f'<div class="card"><div class="meta"><span>🍎 Vita Focus — ждут бету: '
            f'<b>{len(fw_rows)}</b></span></div><div class="idea">{items}</div></div>'
        )
    html = ADMIN_PAGE.format(
        count=len(rows), cards=focus_block + ("".join(cards) or "<p>Пока пусто.</p>"), token=ADMIN_TOKEN
    )
    return HTMLResponse(html)


@app.post("/admin/extend")
def admin_extend(code: str, days: int, token: str = ""):
    if token != ADMIN_TOKEN:
        raise HTTPException(403, "Нет доступа")
    with db() as conn:
        row = conn.execute("SELECT access_until FROM links WHERE code = ?", (code,)).fetchone()
        if row is None:
            raise HTTPException(404, "Нет такой ссылки")
        new_until = _extend(conn, code, days, row[0])
    return {"code": code, "access_until": new_until}


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
