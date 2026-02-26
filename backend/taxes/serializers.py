from rest_framework import serializers

from .models import TaxItem, TaxSaDocument, TaxSaSetting, TaxType, ZatcaOnboarding


class TaxTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxType
        fields = [
            "tax_type_id",
            "name",
            "code",
        ]
        read_only_fields = ["tax_type_id"]


class TaxItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxItem
        fields = [
            "tax_item_id",
            "tax_type",
            "rate",
        ]
        read_only_fields = ["tax_item_id"]


class ZatcaOnboardingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ZatcaOnboarding
        fields = [
            "onboard_id",
            "subsidiary",
            "location",
            "csr",
            "csid",
            "private_key",
            "status",
        ]
        read_only_fields = ["onboard_id"]
        extra_kwargs = {
            "csr": {"write_only": True, "required": False, "allow_null": True},
            "private_key": {"write_only": True, "required": False, "allow_null": True},
        }


class TaxSaSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxSaSetting
        fields = [
            "setting_id",
            "subsidiary",
            "street_name",
            "building_number",
            "plot_identification",
            "city_subdivision",
            "postal_zone",
        ]
        read_only_fields = ["setting_id"]


class TaxSaDocumentListSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxSaDocument
        fields = [
            "doc_id",
            "transaction",
            "hash_value",
            "qr_code",
            "zatca_status",
        ]
        read_only_fields = ["doc_id"]


class TaxSaDocumentDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxSaDocument
        fields = [
            "doc_id",
            "transaction",
            "xml_content",
            "hash_value",
            "qr_code",
            "zatca_status",
        ]
        read_only_fields = ["doc_id"]
