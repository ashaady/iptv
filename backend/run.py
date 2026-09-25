import os
import sys
import asyncio
import uvicorn

from app.main import app as fluxa_app

if __name__ == "__main__":
    if sys.platform == "win32":
        # Empêche le plantage du Proactor event loop sous Windows lors des déconnexions brutales de flux vidéo (WinError 10054)
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    # En mode desktop, reload=False garantit un processus unique sans sous-processus orphelin
    reload_mode = os.environ.get("FLUXA_RELOAD", "false").lower() in ("true", "1", "yes")
    port = int(os.environ.get("FLUXA_PORT", "8000"))
    application = "app.main:app" if reload_mode else fluxa_app
    uvicorn.run(application, host="127.0.0.1", port=port, reload=reload_mode)
