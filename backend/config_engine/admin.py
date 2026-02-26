from django.contrib import admin

from config_engine.models import ConfigDraft, ConfigRelease, EffectiveConfigSnapshot, FeatureFlag, RuleDefinition

admin.site.register(ConfigDraft)
admin.site.register(ConfigRelease)
admin.site.register(FeatureFlag)
admin.site.register(RuleDefinition)
admin.site.register(EffectiveConfigSnapshot)
