from django.contrib import admin

from .models import Customer, Discount, DiscountPolicy, RewardPoint

admin.site.register([Customer, RewardPoint, DiscountPolicy, Discount])
