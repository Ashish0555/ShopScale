import logging
import asyncio
from contextlib import suppress
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from socketio import ASGIApp
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.gzip import GZipMiddleware

from app.api.routes.http import router
from app.core.config import settings
from app.core.errors import ApiError, api_error_handler, http_error_handler, unexpected_error_handler
from app.messaging.kafka import KafkaPublisher
from app.messaging.worker import publish_outbox_forever
from app.messaging.consumer import DomainEventConsumer
from app.websocket.socketio import sio

logging.basicConfig(level=settings.log_level.upper())
kafka_publisher = KafkaPublisher()
outbox_stop = asyncio.Event()
outbox_task: asyncio.Task | None = None
consumer_task: asyncio.Task | None = None
request_count = 0


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global outbox_task, consumer_task
    if settings.node_env != "test":
        try:
            await kafka_publisher.start()
            outbox_task = asyncio.create_task(publish_outbox_forever(kafka_publisher, outbox_stop))
            consumer_task = asyncio.create_task(DomainEventConsumer().run(outbox_stop))
        except Exception:
            logging.getLogger(__name__).warning("Kafka unavailable; HTTP server remains available", exc_info=True)
    yield
    if settings.node_env != "test":
        outbox_stop.set()
        if outbox_task:
            await outbox_task
        if consumer_task:
            consumer_task.cancel()
            with suppress(asyncio.CancelledError):
                await consumer_task
        await kafka_publisher.stop()


app = FastAPI(title="ShopScale API", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.add_exception_handler(ApiError, api_error_handler)
app.add_exception_handler(Exception, unexpected_error_handler)
app.add_exception_handler(StarletteHTTPException, http_error_handler)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, error: RequestValidationError) -> JSONResponse:
    details: dict[str, list[str]] = {}
    for item in error.errors():
        location = item.get("loc", [])
        field = str(location[-1]) if location else "request"
        details.setdefault(field, []).append(item.get("msg", "Invalid value"))
    return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "Invalid request", "details": details}})


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    global request_count
    import uuid
    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    request.state.request_id = request_id
    request_count += 1
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response


app.include_router(router)
app.include_router(router, prefix=settings.api_prefix)


@app.get("/metrics")
def metrics() -> dict[str, int]:
    return {"http.requests": request_count}


asgi_app = ASGIApp(sio, other_asgi_app=app)
