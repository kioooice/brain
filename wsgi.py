"""Production WSGI entrypoint."""

from brain_app import create_app

app = create_app()
