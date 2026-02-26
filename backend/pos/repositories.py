from django.db.models import Max

from pos.models import Branch, ChannelConfig, ConfigVersion


class ConfigRepository:
    @staticmethod
    def current_version(branch: Branch) -> int:
        version_obj, _ = ConfigVersion.objects.get_or_create(branch=branch, defaults={"version": 1})
        return int(version_obj.version)

    @staticmethod
    def bump_version(branch: Branch) -> int:
        version_obj, _ = ConfigVersion.objects.get_or_create(branch=branch, defaults={"version": 1})
        version_obj.version = int(version_obj.version) + 1
        version_obj.save(update_fields=["version", "updated_at"])
        return int(version_obj.version)

    @staticmethod
    def sync_channel_config_version(branch: Branch) -> None:
        version = (
            ChannelConfig.objects.filter(branch=branch).aggregate(Max("config_version"))["config_version__max"]
            or 1
        )
        version_obj, _ = ConfigVersion.objects.get_or_create(branch=branch, defaults={"version": int(version)})
        if version > version_obj.version:
            version_obj.version = int(version)
            version_obj.save(update_fields=["version", "updated_at"])
