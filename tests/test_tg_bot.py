"""Вход через бота и отзывы в чат Vita: пара «старт + секрет», вебхук, одноразовость."""
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

from fastapi import HTTPException
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BOT_TOKEN = "8000000:TESTTOKENTESTTOKENTESTTOKEN"


def hook(update: dict, secret: str | None):
    """Апдейт от телеграма на вебхук — с паролем или без."""
    body = json.dumps(update).encode()

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    headers = [(b"content-type", b"application/json")]
    if secret is not None:
        headers.append((b"x-telegram-bot-api-secret-token", secret.encode()))
    request = Request({
        "type": "http", "http_version": "1.1", "method": "POST",
        "scheme": "https", "path": "/tg/hook", "raw_path": b"/tg/hook",
        "query_string": b"", "headers": headers,
        "server": ("vitadots.ru", 443), "client": ("91.108.6.1", 1), "root_path": "",
    }, receive)
    return asyncio.run(main.tg_hook(request))


def start_update(start: str, user_id: int = 555, username: str = "kamil") -> dict:
    return {"update_id": 1, "message": {
        "message_id": 1, "date": 0, "text": f"/start {start}",
        "chat": {"id": user_id, "type": "private"},
        "from": {"id": user_id, "is_bot": False, "first_name": "Камиль", "username": username},
    }}


def wallpaper_request():
    return Request({
        "type": "http", "http_version": "1.1", "method": "GET",
        "scheme": "https", "path": "/", "raw_path": b"/", "query_string": b"",
        "headers": [(b"host", b"vitadots.ru")], "server": ("vitadots.ru", 443),
        "client": ("1.2.3.4", 1), "root_path": "",
    })


def gone(fn):
    try:
        fn()
    except HTTPException as exc:
        assert exc.status_code == 410, exc.status_code
        return
    raise AssertionError("ожидали 410 — ссылка устарела")


with tempfile.TemporaryDirectory(prefix="vita-tgbot-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    os.environ["TG_BOT_TOKEN"] = BOT_TOKEN
    os.environ["TG_BOT_NAME"] = "vitadots_bot"
    os.environ["TG_REVIEWS_CHAT"] = "-100500"

    from app import main

    phone = "phone-token-" + "1" * 24
    link = main.create_link(main.LinkIn(ownerToken=phone), wallpaper_request())
    secret = main._tg_hook_secret()

    def check(pair, owner=phone):
        return main.auth_tg_check(
            main.TgCheckIn(start=pair["start"], secret=pair["secret"], ownerToken=owner))

    # 1. Кнопка получает пару, ссылка ведёт в бота со стартом.
    pair = main.auth_tg_start()
    assert pair["link"] == "https://t.me/vitadots_bot?start=" + pair["start"]
    assert main.TG_START_RE.fullmatch("/start " + pair["start"]), "старт должен пролезать в /start"

    # 2. Пока «Старт» не нажат — страница ждёт.
    assert check(pair) == {"wait": True}

    # 3. Чужой секрет вход не забирает.
    gone(lambda: check({**pair, "secret": "x" * 32}))

    # 4. Без пароля вебхука апдейт не принимаем.
    for bad in (None, "wrong"):
        try:
            hook(start_update(pair["start"]), bad)
            raise AssertionError("вебхук без пароля должен отбиваться")
        except HTTPException as exc:
            assert exc.status_code == 403

    # 5. Человек нажал «Старт» — бот отвечает, пара подтверждена.
    reply = hook(start_update(pair["start"]), secret)
    assert reply["method"] == "sendMessage" and reply["chat_id"] == 555
    assert "вход подтверждён" in reply["text"]
    # второй «Старт» тем же человеком не пугает «устаревшей ссылкой»
    assert "вход подтверждён" in hook(start_update(pair["start"]), secret)["text"]

    # 6. Страница забирает вход: ключ, кука, обои на месте.
    response = check(pair)
    data = json.loads(response.body)
    assert data["telegram"] == "@kamil" and data["linked"] is True
    assert data["profile"]["wallpapers"][0]["code"] == link["code"], "обои не должны потеряться"
    assert "vita_device=" + data["token"] in response.headers.get("set-cookie", "")
    profile_code = data["profile"]["code"]
    with main.db() as conn:
        assert main._profile_for_token(conn, data["token"]) == profile_code

    # 7. Пара одноразовая, а старый «Старт» бот вежливо отклоняет.
    gone(lambda: check(pair))
    assert "не действует" in hook(start_update(pair["start"]), secret)["text"]

    # 8. Протухшая пара: ни бот, ни страница её не примут.
    old = main.auth_tg_start()
    with main.db() as conn:
        conn.execute("UPDATE tg_login SET created = created - ? WHERE start = ?",
                     (main.TG_LOGIN_TTL + 5, old["start"]))
    assert "не действует" in hook(start_update(old["start"]), secret)["text"]
    gone(lambda: check(old))

    # 9. Чужой телеграм не перехватит уже подтверждённую пару,
    #    а второй телефон попадает в тот же аккаунт.
    grab = main.auth_tg_start()
    hook(start_update(grab["start"]), secret)
    thief = hook(start_update(grab["start"], user_id=777, username="thief"), secret)
    assert "не действует" in thief["text"]
    back = json.loads(check(grab, "other-device-" + "2" * 24).body)
    assert back["profile"]["code"] == profile_code and back["linked"] is False

    # 10. Просто /start без пары — меню: кнопка на сайт, «Продукты» и «О нас».
    def private(text=None, chat_id=42):
        msg = {"message_id": 7, "chat": {"id": chat_id, "type": "private"}, "from": {"id": chat_id}}
        return {"update_id": 2, "message": {**msg, "text": text} if text else msg}

    menu = hook(private("/start"), secret)
    assert menu["method"] == "sendMessage" and menu["parse_mode"] == "HTML"
    buttons = [b for row in menu["reply_markup"]["inline_keyboard"] for b in row]
    assert buttons[0]["url"] == "https://vitadots.ru"
    assert [b.get("callback_data") for b in buttons[1:]] == ["products", "about"]
    # команды из меню и ссылка ?start=about ведут в разделы, любой текст — в меню
    screen_text = lambda name: main._tg_screen(name)["text"]
    assert hook(private("/products"), secret)["text"] == screen_text("products")
    assert hook(private("/about@vitadots_bot"), secret)["text"] == screen_text("about")
    assert hook(private("/start about"), secret)["text"] == screen_text("about")
    assert hook(private("привет"), secret)["text"] == menu["text"]
    # фото и стикеры — молча, чтобы на альбом не сыпались одинаковые ответы
    assert hook(private(), secret) == {"ok": True}

    # 11. Бота добавили в чат Vita — чат запомнен, выгнали — забыт.
    added = {"update_id": 3, "my_chat_member": {
        "chat": {"id": -100500, "type": "supergroup", "title": "Vita"},
        "new_chat_member": {"status": "member"}}}
    assert hook(added, secret) == {"ok": True}
    with main.db() as conn:
        assert conn.execute(
            "SELECT title FROM tg_chats WHERE chat_id = '-100500'").fetchone() == ("Vita",)
    left = {"update_id": 4, "my_chat_member": {
        **added["my_chat_member"], "new_chat_member": {"status": "left"}}}
    hook(left, secret)
    with main.db() as conn:
        assert conn.execute("SELECT 1 FROM tg_chats WHERE chat_id = '-100500'").fetchone() is None

    # 12. Отзыв уходит в чат одной строкой; телеграм подменён — в сеть не ходим.
    sent = []
    main._in_background = lambda fn, *args: fn(*args)
    main._tg_send = lambda chat, text: sent.append((chat, text)) or True
    main.create_review(main.ReviewIn(
        code=link["code"], text="Добавьте ещё шрифты, пожалуйста", stars=5))
    assert sent == [("-100500", "5 звёзд · @kamil пишет: Добавьте ещё шрифты, пожалуйста")], sent

    # без телеграма подписываем тегом профиля
    stranger = main.create_link(main.LinkIn(ownerToken="stranger-" + "3" * 24), wallpaper_request())
    main.create_review(main.ReviewIn(
        code=stranger["code"], text="Сделайте вот такой стиль точек", stars=3))
    note = sent[-1][1]
    assert note.startswith("3 звезды · @vita_") and note.endswith(
        " пишет: Сделайте вот такой стиль точек"), note

    assert main._review_note(1, "@a", "т") == "1 звезда · @a пишет: т"
    assert main._review_note(0, "@a", "т") == "без оценки · @a пишет: т"
    assert main._review_note(11, "@a", "т").startswith("11 звёзд")

    # 13. Кнопки разделов перерисовывают то же сообщение и гасят часики на кнопке.
    calls = []
    main._tg_api = lambda method, payload, timeout=8: calls.append((method, payload)) or {"ok": True}

    def press(data, kind="private"):
        return hook({"update_id": 5, "callback_query": {
            "id": "cb1", "data": data, "from": {"id": 42},
            "message": {"message_id": 7, "chat": {"id": 42, "type": kind}}}}, secret)

    edit = press("products")
    assert (edit["method"], edit["chat_id"], edit["message_id"]) == ("editMessageText", 42, 7)
    assert edit["text"] == screen_text("products")
    assert calls == [("answerCallbackQuery", {"callback_query_id": "cb1"})], calls
    assert press("menu")["reply_markup"] == menu["reply_markup"]
    assert press("drop") == {"ok": True} and press("about", "supergroup") == {"ok": True}
    # вебхук подписан на нажатия, иначе телеграм их не пришлёт
    os.environ.pop("TG_WEBHOOK", None)
    main._tg_hook_register()
    assert "callback_query" in calls[-1][1]["allowed_updates"]

    # 14. Разметка экранов — только теги телеграма и все закрыты, кнопки ведут куда надо.
    from html.parser import HTMLParser

    class Tags(HTMLParser):
        def handle_starttag(self, tag, attrs):
            assert tag in ("b", "i", "a", "blockquote"), tag
            self.stack.append(tag)

        def handle_endtag(self, tag):
            assert self.stack.pop() == tag, tag

    for name in main.TG_SCREENS:
        screen = main._tg_screen(name)
        tags = Tags()
        tags.stack = []
        tags.feed(screen["text"])
        assert not tags.stack and len(screen["text"]) <= 4096, name
        for button in (b for row in screen["reply_markup"]["inline_keyboard"] for b in row):
            assert button.get("url", "").startswith("https://") or button["callback_data"] in main.TG_SCREENS

    # 15. Картинки владельца — образцы для тем: ложатся в data/refs, ответ один
    #     на альбом. Чужие фото и стикеры бот по-прежнему молча пропускает.
    calls.clear()
    admins = {555: "creator", 556: "administrator", 777: "member"}

    def fake_api(method, payload, timeout=8):
        calls.append((method, payload))
        if method == "getChatMember":
            assert payload["chat_id"] == "-100500"
            return {"ok": True, "result": {"status": admins.get(payload["user_id"], "left")}}
        if method == "getFile":
            return {"ok": True, "result": {"file_path": "photos/" + payload["file_id"] + ".jpg"}}
        return {"ok": True}

    main._tg_api = fake_api
    main._tg_send = lambda chat, text: calls.append(("send", chat, text)) or True
    main._tg_download = lambda path: b"\xff\xd8 fake " + path.encode()
    main.TG_ALBUM_WAIT = 0

    def picture(user_id, message_id, group=None, doc=None):
        msg = {"message_id": message_id, "chat": {"id": user_id, "type": "private"},
               "from": {"id": user_id}}
        if doc:
            msg["document"] = {"file_id": f"d{message_id}", "mime_type": doc}
        else:
            msg["photo"] = [{"file_id": f"small{message_id}"}, {"file_id": f"big{message_id}"}]
        if group:
            msg["media_group_id"] = group
        return {"update_id": 6, "message": msg}

    refs = Path(data_dir) / "refs"
    sent_texts = lambda: [c[2] for c in calls if c[0] == "send"]

    assert hook(picture(555, 101), secret) == {"ok": True}
    kept = sorted(p.name for p in refs.iterdir())
    assert len(kept) == 1 and kept[0].endswith("-solo-101.jpg"), kept
    assert (refs / kept[0]).read_bytes().endswith(b"photos/big101.jpg"), "берём крупный размер"
    assert sent_texts() == ["Принял фото для тем"], calls

    # альбом — как в жизни: снимки приходят разом и разбираются параллельно
    import threading
    calls.clear()
    threads = []

    def in_thread(fn, *args):
        threads.append(threading.Thread(target=fn, args=args))
        threads[-1].start()

    main._in_background, main.TG_ALBUM_WAIT = in_thread, 0.5
    for i in (201, 202, 203):
        hook(picture(556, i, group="9001"), secret)
    for t in threads:
        t.join()
    main._in_background, main.TG_ALBUM_WAIT = (lambda fn, *args: fn(*args)), 0
    assert len([p for p in refs.iterdir() if "-9001-" in p.name]) == 3
    assert sent_texts() == ["Принял 3 фото для тем"], "на альбом — один ответ"

    calls.clear()
    hook(picture(555, 301, doc="image/png"), secret)
    assert any(p.name.endswith("-solo-301.png") for p in refs.iterdir())
    hook(picture(555, 302, doc="application/pdf"), secret)
    assert not any("-302." in p.name for p in refs.iterdir()), "не картинка — не берём"

    calls.clear()
    before = set(refs.iterdir())
    hook(picture(777, 401), secret)
    assert set(refs.iterdir()) == before and sent_texts() == [], "чужие фото не сохраняем"
    calls.clear()
    sticker = {"update_id": 7, "message": {"message_id": 402, "chat": {"id": 555, "type": "private"},
                                           "from": {"id": 555}, "sticker": {"file_id": "s"}}}
    assert hook(sticker, secret) == {"ok": True} and calls == [], "стикер — молча и без запросов"

    # не отдалось — просим прислать ещё раз, файла нет
    main._tg_download = lambda path: None
    hook(picture(555, 501), secret)
    assert not any("-501." in p.name for p in refs.iterdir())
    assert sent_texts()[-1] == "Не смог забрать картинку, пришли её ещё раз"

print("Vita telegram bot: passed")
