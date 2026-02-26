from django.contrib import admin

from .models import AddressBook, BranchStation, Currency, CurrencyRate, Location, Subsidiary

admin.site.register(
    [Subsidiary, Location, Currency, CurrencyRate, AddressBook, BranchStation]
)
