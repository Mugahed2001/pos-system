from django.contrib import admin

from .models import (
    FndLoginLog,
    FndResponsibility,
    FndRole,
    FndRoleResponsibility,
    FndUser,
)

admin.site.register(
    [
        FndRole,
        FndResponsibility,
        FndRoleResponsibility,
        FndUser,
        FndLoginLog,
    ]
)
