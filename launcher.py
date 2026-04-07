"""Desktop launcher for the inspiration app."""

from __future__ import annotations

import logging
import socket
import sys
import time
import webbrowser
from pathlib import Path
from threading import Thread

from werkzeug.serving import make_server

from app import app

HOST = "127.0.0.1"
WINDOW_TITLE = "灵感收集"

APP_DIR = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
LOG_FILE = APP_DIR / "launcher.log"

logging.basicConfig(
    filename=str(LOG_FILE),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("launcher")


class ServerThread(Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.server = make_server(HOST, 0, app)
        self.port = self.server.server_port

    def run(self):
        self.server.serve_forever()

    def shutdown(self):
        self.server.shutdown()


def wait_until_ready(port: int, timeout: float = 10.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((HOST, port), timeout=0.2):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def open_native_window(url: str) -> bool:
    try:
        import webview
    except Exception:
        logger.exception("Failed to import webview")
        return False

    try:
        webview.create_window(
            WINDOW_TITLE,
            url,
            width=1180,
            height=820,
            min_size=(1180, 820),
            resizable=False,
            frameless=False,
            easy_drag=False,
            shadow=True,
            confirm_close=True,
            background_color="#111111",
            zoomable=False,
        )
        webview.start(debug=False, gui="edgechromium")
        return True
    except Exception:
        logger.exception("Failed to open native webview window")
        return False


def main():
    server = ServerThread()
    server.start()
    url = f"http://{HOST}:{server.port}"

    try:
        if not wait_until_ready(server.port):
            logger.error("Server did not become ready in time: %s", url)
            print(f"Server started, but it was not ready in time: {url}")
            return

        if not open_native_window(url):
            logger.info("Falling back to browser: %s", url)
            webbrowser.open(url)
            print(f"Opened in browser: {url}")
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
