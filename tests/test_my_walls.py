"""Мои обои: конфиг по коду, удаление своего и проверка свободного тега."""
import os
import sys
import tempfile
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with tempfile.TemporaryDirectory(prefix="vita-walls-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    from app import main

    class FakeRequest:
        base_url = "http://testserver/"

    mine = "walls-token-" + "7" * 24
    other = "walls-other-" + "8" * 24
    main.ensure_profile(main.ProfileIn(ownerToken=mine))
    main.ensure_profile(main.ProfileIn(ownerToken=other))

    made = main.create_link(main.LinkIn(ownerToken=mine, title="ТВОЙ МЕСЯЦ", font="oswald"), FakeRequest())
    code = made["code"]

    # конфиг для конструктора: по нему открывается чужая сборка
    got = main.link_config(code)
    assert got["code"] == code
    assert got["config"]["title"] == "ТВОЙ МЕСЯЦ" and got["config"]["font"] == "oswald"
    assert "ownerToken" not in got["config"], "токен владельца наружу не отдаём"

    try:
        main.link_config("zzzzzz")
        raise AssertionError("несуществующий код должен давать 404")
    except HTTPException as exc:
        assert exc.status_code == 404

    # свободен ли тег
    assert main.tag_free("novyj_teg")["free"] is True
    assert main.tag_free("абвгд")["ok"] is False
    busy = main.update_profile(main.ProfileUpdateIn(ownerToken=mine, handle="kamil_vita"))["handle"]
    assert main.tag_free(busy)["free"] is False
    assert main.tag_free("KAMIL_VITA")["free"] is False, "регистр не должен пускать двойника"

    # удалять можно только свои обои
    for token, why in ((other, "чужой токен"), ("", "без токена")):
        try:
            main.drop_link(code, token)
            raise AssertionError(f"{why} не должен удалять")
        except HTTPException as exc:
            assert exc.status_code == 403

    assert main.drop_link(code, mine)["ok"] is True
    try:
        main.link_config(code)
        raise AssertionError("удалённые обои должны исчезать")
    except HTTPException as exc:
        assert exc.status_code == 404

print("Vita my walls: passed")
