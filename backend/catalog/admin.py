from django.contrib import admin

from .models import (
    FndLov,
    FndLovValue,
    Item,
    ItemCategory,
    ItemPriceList,
    Uom,
    UnitType,
)

admin.site.register(
    [Uom, UnitType, ItemCategory, Item, ItemPriceList, FndLov, FndLovValue]
)
