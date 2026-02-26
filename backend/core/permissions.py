from django.conf import settings
from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAuthenticatedReadOnlyOrAdminWrite(BasePermission):
    """
    Safe methods require an authenticated user.
    Unsafe methods require an authenticated staff user.
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if request.method in SAFE_METHODS:
            return bool(user and user.is_authenticated)
        return bool(user and user.is_authenticated and user.is_staff)


class PublicReadOnlyOrAdminWrite(BasePermission):
    """
    Safe methods are public.
    Unsafe methods require an authenticated staff user.
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = getattr(request, "user", None)
        return bool(user and user.is_authenticated and user.is_staff)


class PosPublicApiPermission(BasePermission):
    """
    Development-friendly permission that can be hardened via settings:

    - If settings.POS_PUBLIC_API_READ is True: allow unauthenticated SAFE_METHODS.
    - If settings.POS_PUBLIC_API_WRITE is True: allow unauthenticated unsafe methods.
    - Otherwise: SAFE_METHODS require authentication; unsafe methods require staff.
    """

    def has_permission(self, request, view):
        user = getattr(request, "user", None)

        if request.method in SAFE_METHODS:
            if getattr(settings, "POS_PUBLIC_API_READ", False):
                return True
            return bool(user and user.is_authenticated)

        if getattr(settings, "POS_PUBLIC_API_WRITE", False):
            return True

        return bool(user and user.is_authenticated and user.is_staff)
