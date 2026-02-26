from django.conf import settings
from django.db import connection


class ForceDebugCursorMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if getattr(settings, "LOG_DB_QUERIES", False):
            connection.force_debug_cursor = True
        return self.get_response(request)
