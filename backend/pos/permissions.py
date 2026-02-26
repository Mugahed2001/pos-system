from rest_framework.permissions import BasePermission

from pos.models import Device


class DeviceTokenPermission(BasePermission):
    message = "Missing or invalid X-Device-Token header."

    def has_permission(self, request, view):
        token = request.headers.get("X-Device-Token", "").strip()
        device = None
        if token:
            device = Device.objects.filter(token=token, is_active=True).select_related("branch").first()

        # Fallback for clients that pass device_id while device token is stale/missing.
        if not device:
            device_id = (request.query_params.get("device_id") or request.data.get("device_id") or "").strip()
            if device_id:
                device = Device.objects.filter(device_id=device_id, is_active=True).select_related("branch").first()

        if not device:
            return False
        request.pos_device = device
        return True


class DeviceBranchScopedPermission(BasePermission):
    message = "Branch mismatch for device."

    def has_permission(self, request, view):
        device = getattr(request, "pos_device", None)
        branch_id = request.query_params.get("branch_id") or request.data.get("branch_id")
        if not branch_id or not device:
            return True
        return str(device.branch_id) == str(branch_id)
