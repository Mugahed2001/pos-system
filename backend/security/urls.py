from rest_framework.routers import DefaultRouter

from .views import (
    LoginLogViewSet,
    ResponsibilityViewSet,
    RoleResponsibilityViewSet,
    RoleViewSet,
    UserViewSet,
)

router = DefaultRouter()
router.register("security/roles", RoleViewSet, basename="role")
router.register("security/responsibilities", ResponsibilityViewSet, basename="responsibility")
router.register("security/role-responsibilities", RoleResponsibilityViewSet, basename="role-responsibility")
router.register("security/users", UserViewSet, basename="user")
router.register("security/login-logs", LoginLogViewSet, basename="login-log")

urlpatterns = [
    *router.urls,
]
