# Generated manually for config_engine
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("pos", "0007_order_payment_shift"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ConfigDraft",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                (
                    "status",
                    models.CharField(
                        choices=[("draft", "draft"), ("published", "published"), ("rolled_back", "rolled_back"), ("archived", "archived")],
                        default="draft",
                        max_length=16,
                    ),
                ),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("checksum", models.CharField(blank=True, db_index=True, default="", max_length=64)),
                ("base_version", models.BigIntegerField(default=0)),
                ("published_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "branch",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="config_drafts",
                        to="pos.branch",
                    ),
                ),
                (
                    "company",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="config_drafts", to="pos.company"),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_config_drafts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "published_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="published_config_drafts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="FeatureFlag",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("key", models.CharField(max_length=128)),
                (
                    "scope_type",
                    models.CharField(
                        choices=[("company", "company"), ("branch", "branch"), ("channel", "channel"), ("role", "role")],
                        default="branch",
                        max_length=16,
                    ),
                ),
                ("scope_value", models.CharField(blank=True, default="", max_length=128)),
                ("enabled", models.BooleanField(default=True)),
                ("priority", models.IntegerField(default=100)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "branch",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="feature_flags",
                        to="pos.branch",
                    ),
                ),
                (
                    "company",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="feature_flags", to="pos.company"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="RuleDefinition",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                ("enabled", models.BooleanField(default=True)),
                ("priority", models.IntegerField(default=100)),
                ("condition", models.JSONField(blank=True, default=dict)),
                ("action", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "branch",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="rules",
                        to="pos.branch",
                    ),
                ),
                (
                    "company",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="rules", to="pos.company"),
                ),
            ],
        ),
        migrations.CreateModel(
            name="ConfigRelease",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("version", models.BigIntegerField(db_index=True)),
                ("checksum", models.CharField(db_index=True, max_length=64)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                (
                    "branch",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="config_releases", to="pos.branch"),
                ),
                (
                    "company",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="config_releases", to="pos.company"),
                ),
                (
                    "created_by",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL),
                ),
                (
                    "draft",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="releases", to="config_engine.configdraft"),
                ),
                (
                    "rolled_back_from",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="rollback_children",
                        to="config_engine.configrelease",
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="EffectiveConfigSnapshot",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("role_code", models.CharField(blank=True, default="", max_length=64)),
                ("channel_code", models.CharField(blank=True, default="", max_length=32)),
                ("config_version", models.BigIntegerField(default=0)),
                ("checksum", models.CharField(db_index=True, max_length=64)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("generated_at", models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                (
                    "branch",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="effective_configs", to="pos.branch"),
                ),
                (
                    "company",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="effective_configs", to="pos.company"),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="configdraft",
            index=models.Index(fields=["company", "created_at"], name="config_engin_company_3152df_idx"),
        ),
        migrations.AddIndex(
            model_name="configdraft",
            index=models.Index(fields=["branch", "status"], name="config_engin_branch__db9f58_idx"),
        ),
        migrations.AddConstraint(
            model_name="configrelease",
            constraint=models.UniqueConstraint(fields=("branch", "version"), name="uniq_config_release_version_per_branch"),
        ),
        migrations.AddIndex(
            model_name="configrelease",
            index=models.Index(fields=["branch", "is_active"], name="config_engin_branch__9de267_idx"),
        ),
        migrations.AddIndex(
            model_name="configrelease",
            index=models.Index(fields=["branch", "created_at"], name="config_engin_branch__7306e5_idx"),
        ),
        migrations.AddConstraint(
            model_name="featureflag",
            constraint=models.UniqueConstraint(
                fields=("company", "branch", "key", "scope_type", "scope_value"), name="uniq_feature_flag_scope"
            ),
        ),
        migrations.AddIndex(
            model_name="featureflag",
            index=models.Index(fields=["company", "branch", "key"], name="config_engin_company_3f713f_idx"),
        ),
        migrations.AddIndex(
            model_name="featureflag",
            index=models.Index(fields=["priority"], name="config_engin_priorit_5395d1_idx"),
        ),
        migrations.AddIndex(
            model_name="ruledefinition",
            index=models.Index(fields=["company", "branch", "enabled"], name="config_engin_company_f52600_idx"),
        ),
        migrations.AddIndex(
            model_name="ruledefinition",
            index=models.Index(fields=["priority"], name="config_engin_priorit_e95c0d_idx"),
        ),
        migrations.AddConstraint(
            model_name="effectiveconfigsnapshot",
            constraint=models.UniqueConstraint(
                fields=("branch", "role_code", "channel_code", "config_version"), name="uniq_effective_config_snapshot"
            ),
        ),
        migrations.AddIndex(
            model_name="effectiveconfigsnapshot",
            index=models.Index(fields=["branch", "generated_at"], name="config_engin_branch__d975f2_idx"),
        ),
    ]
