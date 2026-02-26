from rest_framework import serializers

from .models import AddressBook, BranchStation, Currency, CurrencyRate, Location, Subsidiary


class SubsidiarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Subsidiary
        fields = [
            "subsidiary_id",
            "name",
            "tax_number",
            "commercial_registration",
            "created_at",
        ]
        read_only_fields = ["subsidiary_id", "created_at"]


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = [
            "location_id",
            "subsidiary",
            "name",
            "address",
            "is_active",
        ]
        read_only_fields = ["location_id"]


class BranchStationSerializer(serializers.ModelSerializer):
    class Meta:
        model = BranchStation
        fields = [
            "station_id",
            "location",
            "name",
            "mac_address",
            "last_sync",
        ]
        read_only_fields = ["station_id", "last_sync"]


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = [
            "currency_id",
            "code",
            "name",
            "symbol",
        ]
        read_only_fields = ["currency_id"]


class CurrencyRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = CurrencyRate
        fields = [
            "rate_id",
            "currency",
            "rate",
            "effective_date",
        ]
        read_only_fields = ["rate_id"]


class AddressBookSerializer(serializers.ModelSerializer):
    class Meta:
        model = AddressBook
        fields = [
            "address_id",
            "entity_id",
            "entity_type",
            "street",
            "city",
            "postal_code",
            "country",
        ]
        read_only_fields = ["address_id"]
