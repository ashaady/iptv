from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .database import db
from .routers import content, profiles, user_data
from .schemas import HealthResponse
from .services.xtream import XtreamError


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.initialize()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="API sécurisée pour les abonnements IPTV compatibles Xtream Codes.",
    lifespan=lifespan,
)
cors_origins = [
    "https://iptv-mu-gilt.vercel.app",
    *settings.cors_origin_list,
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?://([a-zA-Z0-9-]+\.)*(vercel\.app|localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(XtreamError)
async def xtream_error_handler(_: Request, exc: XtreamError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


@app.get("/", tags=["Système"])
def root() -> dict[str, str]:
    return {
        "status": "ok",
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
    }


@app.get("/health", response_model=HealthResponse, tags=["Système"])
def health() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.app_name, version=settings.app_version)


@app.post("/shutdown", tags=["Système"])
def shutdown_server():
    import os
    import signal
    import threading

    def _kill():
        import time
        time.sleep(0.2)
        try:
            os.kill(os.getpid(), signal.SIGTERM)
        except Exception:
            os._exit(0)

    threading.Thread(target=_kill, daemon=True).start()
    return {"status": "ok", "message": "Extinction du backend..."}



app.include_router(profiles.router, prefix=settings.api_prefix)
app.include_router(content.router, prefix=settings.api_prefix)
app.include_router(user_data.router, prefix=settings.api_prefix)
