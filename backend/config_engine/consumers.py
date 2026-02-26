from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from rest_framework.authtoken.models import Token

from config_engine.services import WS_GROUP_CONFIG_PREFIX, WS_GROUP_KDS_PREFIX, WS_GROUP_PERMISSION_PREFIX
from pos.models import Device


class BasePosConsumer(AsyncJsonWebsocketConsumer):
    group_prefix = ""

    async def connect(self):
        self.branch_id = str(self.scope["url_route"]["kwargs"]["branch_id"])
        if not await self._is_authorized():
            await self.close(code=4401)
            return

        self.group_name = f"{self.group_prefix}_{self.branch_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        group_name = getattr(self, "group_name", "")
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def _is_authorized(self) -> bool:
        query = self.scope.get("query_string", b"").decode("utf-8")
        parts = [segment for segment in query.split("&") if segment]
        query_map: dict[str, str] = {}
        for part in parts:
            if "=" not in part:
                continue
            k, v = part.split("=", 1)
            query_map[k] = v

        token_key = (query_map.get("token") or "").strip()
        device_token = (query_map.get("device_token") or "").strip()

        if not token_key:
            return False

        return await self._validate_tokens(token_key=token_key, device_token=device_token)

    @database_sync_to_async
    def _validate_tokens(self, token_key: str, device_token: str) -> bool:
        auth_token = Token.objects.select_related("user").filter(key=token_key).first()
        if not auth_token or not auth_token.user_id:
            return False

        if not device_token:
            return True

        device = Device.objects.filter(token=device_token, is_active=True).select_related("branch").first()
        if not device:
            return False
        return str(device.branch_id) == self.branch_id


class PosConfigConsumer(BasePosConsumer):
    group_prefix = WS_GROUP_CONFIG_PREFIX

    async def config_event(self, event):
        await self.send_json(event["message"])


class PosOrdersConsumer(BasePosConsumer):
    group_prefix = "orders"

    async def order_event(self, event):
        await self.send_json(event["message"])


class PosPermissionConsumer(BasePosConsumer):
    group_prefix = WS_GROUP_PERMISSION_PREFIX

    async def permission_event(self, event):
        await self.send_json(event["message"])


class PosKdsConsumer(BasePosConsumer):
    group_prefix = WS_GROUP_KDS_PREFIX

    async def kds_event(self, event):
        await self.send_json(event["message"])
