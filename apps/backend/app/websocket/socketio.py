import socketio
import inspect
from sqlalchemy import select

from app.core.config import settings
from app.core.security import verify_access_token
from app.db.database import SessionLocal
from app.models import User
from app.schemas import OrderResponse

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=settings.cors_origins)


@sio.event
async def connect(sid, environ, auth):
    token = (auth or {}).get("token") or environ.get("HTTP_AUTHORIZATION", "").removeprefix("Bearer ").strip()
    try:
        token_user = verify_access_token(str(token))
        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.id == token_user["id"], User.is_active.is_(True)))
            if not user:
                return False
            await sio.save_session(sid, {"user_id": str(user.id)})
            await sio.enter_room(sid, f"user:{user.id}")
            return True
    except Exception:
        return False


@sio.on("order:subscribe")
async def order_subscribe(sid, order_id, callback=None):
    from app.services import get_order
    session = await sio.get_session(sid)
    try:
        with SessionLocal() as db:
            order = get_order(db, order_id, session["user_id"])
            await sio.enter_room(sid, f"order:{order.id}")
            if callback:
                result = callback({"ok": True, "order": OrderResponse.model_validate(order).model_dump(by_alias=True, mode="json")})
                if inspect.isawaitable(result):
                    await result
    except Exception:
        if callback:
            result = callback({"ok": False, "error": "Order not found"})
            if inspect.isawaitable(result):
                await result


async def emit_order_updated(order) -> None:
    payload = {"order": OrderResponse.model_validate(order).model_dump(by_alias=True, mode="json")}
    await sio.emit("order:updated", payload, room=f"order:{order.id}")
    await sio.emit("order:updated", payload, room=f"user:{order.user_id}")
