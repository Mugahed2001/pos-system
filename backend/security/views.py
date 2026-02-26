from rest_framework.permissions import IsAdminUser
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from core.permissions import IsAuthenticatedReadOnlyOrAdminWrite
from .models import FndLoginLog, FndResponsibility, FndRole, FndRoleResponsibility, FndUser
from .serializers import (
    FndLoginLogSerializer,
    FndResponsibilitySerializer,
    FndRoleResponsibilitySerializer,
    FndRoleSerializer,
    FndUserSerializer,
)


class RoleViewSet(ModelViewSet):
    queryset = FndRole.objects.select_related("subsidiary").order_by("role_name")
    serializer_class = FndRoleSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWrite]


class ResponsibilityViewSet(ModelViewSet):
    queryset = FndResponsibility.objects.order_by("code")
    serializer_class = FndResponsibilitySerializer
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWrite]


class RoleResponsibilityViewSet(ModelViewSet):
    queryset = FndRoleResponsibility.objects.select_related("role", "responsibility").order_by(
        "role_id"
    )
    serializer_class = FndRoleResponsibilitySerializer
    permission_classes = [IsAuthenticatedReadOnlyOrAdminWrite]


class UserViewSet(ReadOnlyModelViewSet):
    queryset = FndUser.objects.select_related("subsidiary", "role").order_by("username")
    serializer_class = FndUserSerializer
    permission_classes = [IsAdminUser]


class LoginLogViewSet(ReadOnlyModelViewSet):
    queryset = FndLoginLog.objects.select_related("user").order_by("-login_time")
    serializer_class = FndLoginLogSerializer
    permission_classes = [IsAdminUser]
