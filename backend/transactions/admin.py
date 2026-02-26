from django.contrib import admin

from .models import (
    PaymentMethod,
    Transaction,
    TransactionComment,
    TransactionLine,
    TransactionStatus,
    TransactionTaxDetail,
)

admin.site.register(
    [
        PaymentMethod,
        TransactionStatus,
        Transaction,
        TransactionLine,
        TransactionTaxDetail,
        TransactionComment,
    ]
)
