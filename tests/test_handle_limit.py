"""Тег: выбирается один раз при регистрации, потом меняется один раз."""
import os
import sys
import tempfile
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

with tempfile.TemporaryDirectory(prefix="vita-handle-") as data_dir:
    os.environ["VITA_DATA"] = data_dir
    from app import main

    token = "handle-token-" + "5" * 24
    profile = main.ensure_profile(main.ProfileIn(ownerToken=token))
    assert profile["handle"].startswith("vita_"), "новичку выдаётся служебный тег"
    assert profile["handleLeft"] == 1 and profile["handleLocked"] is False

    def rename(handle):
        return main.update_profile(main.ProfileUpdateIn(ownerToken=token, handle=handle))

    # выбор своего тега при регистрации в лимит не идёт
    first = rename("kamil")
    assert first["handle"] == "kamil"
    assert first["handleLeft"] == 1, "выбор тега — это ещё не замена"

    second = rename("kamil_vita")
    assert second["handle"] == "kamil_vita" and second["handleLeft"] == 0
    assert second["handleLocked"] is True

    try:
        rename("kamil_dots")
        raise AssertionError("вторая замена должна отбиваться")
    except HTTPException as exc:
        assert exc.status_code == 409 and "один раз" in exc.detail

    # тот же тег заново — не замена, отказа быть не должно
    same = rename("kamil_vita")
    assert same["handle"] == "kamil_vita"

    # имя меняется свободно и после блокировки тега
    named = main.update_profile(main.ProfileUpdateIn(ownerToken=token, name="Камиль"))
    assert named["name"] == "Камиль" and named["handleLocked"] is True

print("Vita handle limit: passed")
