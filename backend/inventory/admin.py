from django.contrib import admin

from .models import (
    Bin,
    TransactionInventoryBatch,
    TransactionInventoryDetail,
    XxItemSerialNumber,
)

admin.site.register(
    [Bin, TransactionInventoryDetail, TransactionInventoryBatch, XxItemSerialNumber]
)
