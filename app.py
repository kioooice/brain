"""Application entrypoint."""

from __future__ import annotations

import os

from brain_app import create_app

app = create_app()


if __name__ == "__main__":
    debug = os.getenv("BRAIN_DEBUG", "1").lower() in {"1", "true", "yes", "on"}
    host = os.getenv("BRAIN_HOST", "127.0.0.1")
    port = int(os.getenv("BRAIN_PORT", "5001"))
    app.run(debug=debug, host=host, port=port)
