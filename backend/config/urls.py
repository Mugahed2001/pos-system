"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token
from rest_framework.schemas import get_schema_view

try:
    from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
except Exception:  # pragma: no cover - optional dependency in some environments
    SpectacularAPIView = None
    SpectacularSwaggerView = None
    SpectacularRedocView = None

urlpatterns = [
    path('admin/', admin.site.urls),
    path("api/auth/token/", obtain_auth_token),
    path("api/", include("accounting.urls")),
    path("api/", include("tenants.urls")),
    path("api/", include("catalog.urls")),
    path("api/", include("customers.urls")),
    path("api/", include("inventory.urls")),
    path("api/", include("taxes.urls")),
    path("api/", include("transactions.urls")),
    path("api/", include("reporting.urls")),
    path("api/", include("security.urls")),
    path("api/v1/", include("config_engine.urls")),
    path("api/v1/", include("sync_engine.urls")),
    path("api/v1/", include("workflow.urls")),
    path("api/v1/", include("pos.urls")),
]

urlpatterns += [
    path(
        "api/openapi.json",
        get_schema_view(title="POS API", version="1.0.0", description="Offline-first Restaurant POS APIs"),
        name="openapi-native",
    ),
]

if SpectacularAPIView and SpectacularSwaggerView and SpectacularRedocView:
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
        path(
            "api/schema/swagger-ui/",
            SpectacularSwaggerView.as_view(url_name="schema"),
            name="swagger-ui",
        ),
        path(
            "api/schema/redoc/",
            SpectacularRedocView.as_view(url_name="schema"),
            name="redoc",
        ),
    ]
