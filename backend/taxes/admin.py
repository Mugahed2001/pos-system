from django.contrib import admin

from .models import TaxItem, TaxSaDocument, TaxSaSetting, TaxType, ZatcaOnboarding

admin.site.register(
    [TaxType, TaxItem, ZatcaOnboarding, TaxSaSetting, TaxSaDocument]
)
