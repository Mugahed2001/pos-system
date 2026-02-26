from django.urls import path

from config_engine.consumers import PosConfigConsumer, PosKdsConsumer, PosOrdersConsumer, PosPermissionConsumer

websocket_urlpatterns = [
    path("ws/pos/config/<uuid:branch_id>/", PosConfigConsumer.as_asgi()),
    path("ws/pos/orders/<uuid:branch_id>/", PosOrdersConsumer.as_asgi()),
    path("ws/pos/kds/<uuid:branch_id>/", PosKdsConsumer.as_asgi()),
    path("ws/pos/permissions/<uuid:branch_id>/", PosPermissionConsumer.as_asgi()),
]
