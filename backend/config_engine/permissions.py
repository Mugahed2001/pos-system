from rest_framework.permissions import BasePermission


class CanManageConfigPermission(BasePermission):
    message = "You do not have permission to manage configuration."

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return False
        if request.method in {"GET", "HEAD", "OPTIONS"}:
            return True
        return bool(user.is_staff or user.is_superuser)
