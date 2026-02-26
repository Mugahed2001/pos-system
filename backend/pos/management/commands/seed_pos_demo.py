from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from rest_framework.authtoken.models import Token

from pos.models import (
    Address,
    Branch,
    ChannelConfig,
    ComboBundle,
    ComboBundleItem,
    Company,
    ConfigVersion,
    Customer,
    Device,
    DiscountPolicy,
    ErpCoupon,
    Floor,
    Driver,
    ManagerOverride,
    MenuCategory,
    MenuItem,
    ModifierGroup,
    ModifierItem,
    OrderChannel,
    PriceList,
    PriceListItem,
    Role,
    Seat,
    ServiceChargeRule,
    TaxProfile,
    TaxRule,
)


class Command(BaseCommand):
    help = "Seed demo POS data for local development."

    def handle(self, *args, **options):
        company, _ = Company.objects.get_or_create(code="COMP-001", defaults={"name": "مجموعة مطاعم تجريبية"})
        branch, _ = Branch.objects.get_or_create(
            code="BR-001",
            defaults={"company": company, "name": "الفرع الرئيسي", "timezone_name": "UTC"},
        )
        if branch.company_id != company.id:
            branch.company = company
            branch.save(update_fields=["company", "updated_at"])

        device, _ = Device.objects.get_or_create(
            device_id="POS-DEVICE-001",
            defaults={
                "branch": branch,
                "display_name": "نقطة بيع رئيسية",
                "token": "device-demo-token",
                "config_version": 1,
            },
        )
        if not device.token:
            device.token = "device-demo-token"
            device.save(update_fields=["token", "updated_at"])

        user_model = get_user_model()
        admin_user, _ = user_model.objects.get_or_create(
            username="admin",
            defaults={"is_staff": True, "is_superuser": True, "email": "admin@example.com"},
        )
        admin_user.set_password("admin123")
        admin_user.save()
        Token.objects.get_or_create(user=admin_user)

        cashier_user, _ = user_model.objects.get_or_create(
            username="cashier",
            defaults={"is_staff": False, "is_superuser": False, "email": "cashier@example.com"},
        )
        cashier_user.set_password("cashier123")
        cashier_user.save()
        Token.objects.get_or_create(user=cashier_user)

        cook_user, _ = user_model.objects.get_or_create(
            username="cook",
            defaults={"is_staff": False, "is_superuser": False, "email": "cook@example.com"},
        )
        cook_user.set_password("cook123")
        cook_user.save()
        Token.objects.get_or_create(user=cook_user)

        supervisor_user, _ = user_model.objects.get_or_create(
            username="supervisor",
            defaults={"is_staff": False, "is_superuser": False, "email": "supervisor@example.com"},
        )
        supervisor_user.set_password("supervisor123")
        supervisor_user.save()
        Token.objects.get_or_create(user=supervisor_user)

        waiter_user, _ = user_model.objects.get_or_create(
            username="waiter",
            defaults={"is_staff": False, "is_superuser": False, "email": "waiter@example.com"},
        )
        waiter_user.set_password("waiter123")
        waiter_user.save()
        Token.objects.get_or_create(user=waiter_user)

        django_groups = {
            "cashier": Group.objects.get_or_create(name="cashier")[0],
            "waiter": Group.objects.get_or_create(name="waiter")[0],
            "cook": Group.objects.get_or_create(name="cook")[0],
            "kitchen": Group.objects.get_or_create(name="kitchen")[0],
            "kitchen_supervisor": Group.objects.get_or_create(name="kitchen_supervisor")[0],
            "manager": Group.objects.get_or_create(name="manager")[0],
        }
        cashier_user.groups.add(django_groups["cashier"])
        waiter_user.groups.add(django_groups["waiter"])
        cook_user.groups.add(django_groups["cook"], django_groups["kitchen"])
        supervisor_user.groups.add(django_groups["kitchen_supervisor"])
        admin_user.groups.add(django_groups["manager"])

        role_seed = [
            ("manager", ["orders.void", "orders.refund", "orders.discount", "shift.close", "cash.open_drawer"]),
            ("cashier", ["orders.create", "orders.pay", "shift.open"]),
            ("waiter", ["orders.create", "orders.update", "orders.submit", "tables.view"]),
            ("kitchen", ["kds.view", "kds.update"]),
        ]
        for role_name, perms in role_seed:
            role_obj, _ = Role.objects.get_or_create(name=role_name, defaults={"permissions": perms})
            if role_obj.permissions != perms:
                role_obj.permissions = perms
                role_obj.save(update_fields=["permissions", "updated_at"])

        ManagerOverride.objects.get_or_create(
            user=admin_user,
            pin="1234",
            defaults={"is_active": True},
        )

        channels = {
            "dine_in": "صالة",
            "takeaway": "سفري",
            "pickup": "استلام",
            "pickup_window": "شباك الاستلام",
            "delivery": "توصيل",
            "preorder": "طلب مسبق",
        }
        channel_objs = {}
        for code, label in channels.items():
            obj, _ = OrderChannel.objects.get_or_create(code=code, defaults={"display_name": label})
            channel_objs[code] = obj

        floor, _ = Floor.objects.get_or_create(branch=branch, name="الصالة الرئيسية", defaults={"sort_order": 1})
        for idx in range(1, 6):
            table_obj, _ = branch.tables.get_or_create(
                floor=floor,
                code=f"T{idx}",
                defaults={"seats_count": 4},
            )
            for seat_no in range(1, 5):
                Seat.objects.get_or_create(table=table_obj, seat_no=seat_no)

        price_list, _ = PriceList.objects.get_or_create(branch=branch, name="القائمة الأساسية", defaults={"is_default": True})

        category_seed = [
            {"name": "المقبلات", "sort_order": 1},
            {"name": "السلطات", "sort_order": 2},
            {"name": "الأطباق الرئيسية", "sort_order": 3},
            {"name": "المشاوي", "sort_order": 4},
            {"name": "المشروبات", "sort_order": 5},
            {"name": "الحلويات", "sort_order": 6},
            {"name": "التبغ والشيشة", "sort_order": 7},
        ]
        category_objs = {}
        for category_data in category_seed:
            menu_category, _ = MenuCategory.objects.get_or_create(
                branch=branch,
                name=category_data["name"],
                defaults={"sort_order": category_data["sort_order"], "is_active": True},
            )
            category_updates = []
            if menu_category.sort_order != category_data["sort_order"]:
                menu_category.sort_order = category_data["sort_order"]
                category_updates.append("sort_order")
            if not menu_category.is_active:
                menu_category.is_active = True
                category_updates.append("is_active")
            if category_updates:
                menu_category.save(update_fields=category_updates + ["updated_at"])
            category_objs[category_data["name"]] = menu_category

        menu_item_seed = [
            {"code": "APP-HUMMUS", "name": "حمص بالطحينة", "category": "المقبلات", "base_price": "18.00", "kitchen_station": "cold"},
            {"code": "APP-MOUTABAL", "name": "متبل", "category": "المقبلات", "base_price": "19.00", "kitchen_station": "cold"},
            {"code": "APP-FRIES", "name": "بطاطس مقلية", "category": "المقبلات", "base_price": "16.00", "kitchen_station": "fryer"},
            {"code": "SAL-FATTOUSH", "name": "فتوش", "category": "السلطات", "base_price": "22.00", "kitchen_station": "cold"},
            {"code": "SAL-TABBOULEH", "name": "تبولة", "category": "السلطات", "base_price": "24.00", "kitchen_station": "cold"},
            {"code": "SAL-CAESAR", "name": "سلطة سيزر", "category": "السلطات", "base_price": "28.00", "kitchen_station": "cold"},
            {"code": "MAIN-KABSA-CHICK", "name": "كبسة دجاج", "category": "الأطباق الرئيسية", "base_price": "45.00", "kitchen_station": "hot"},
            {"code": "MAIN-MANDI-MEAT", "name": "مندي لحم", "category": "الأطباق الرئيسية", "base_price": "58.00", "kitchen_station": "hot"},
            {"code": "MAIN-PASTA-CHICK", "name": "باستا بالدجاج", "category": "الأطباق الرئيسية", "base_price": "42.00", "kitchen_station": "hot"},
            {"code": "GRILL-SHISH", "name": "شيش طاووق", "category": "المشاوي", "base_price": "47.00", "kitchen_station": "grill"},
            {"code": "GRILL-KOFTA", "name": "كباب لحم", "category": "المشاوي", "base_price": "52.00", "kitchen_station": "grill"},
            {"code": "GRILL-MIX", "name": "مشاوي مشكلة", "category": "المشاوي", "base_price": "79.00", "kitchen_station": "grill"},
            {
                "code": "DRINK-COLA",
                "name": "كولا",
                "category": "المشروبات",
                "base_price": "8.00",
                "kitchen_station": "bar",
                "excise_category": "carbonated_drinks",
            },
            {"code": "DRINK-ORANGE", "name": "عصير برتقال طازج", "category": "المشروبات", "base_price": "16.00", "kitchen_station": "bar"},
            {
                "code": "DRINK-MINT",
                "name": "ليمون بالنعناع",
                "category": "المشروبات",
                "base_price": "18.00",
                "kitchen_station": "bar",
                "excise_category": "sweetened_drinks",
            },
            {"code": "DRINK-WATER", "name": "مياه معدنية", "category": "المشروبات", "base_price": "5.00", "kitchen_station": "bar"},
            {
                "code": "DRINK-ENERGY",
                "name": "مشروب طاقة",
                "category": "المشروبات",
                "base_price": "14.00",
                "kitchen_station": "bar",
                "excise_category": "energy_drinks",
            },
            {"code": "DESS-UMMALI", "name": "أم علي", "category": "الحلويات", "base_price": "24.00", "kitchen_station": "pastry"},
            {"code": "DESS-KUNAFA", "name": "كنافة", "category": "الحلويات", "base_price": "26.00", "kitchen_station": "pastry"},
            {"code": "DESS-ICECREAM", "name": "آيس كريم فانيلا", "category": "الحلويات", "base_price": "20.00", "kitchen_station": "pastry"},
            {
                "code": "TOBACCO-CIG",
                "name": "منتج تبغ",
                "category": "التبغ والشيشة",
                "base_price": "30.00",
                "kitchen_station": "bar",
                "excise_category": "tobacco_products",
            },
            {
                "code": "SHISHA-APPLE",
                "name": "شيشة تفاحتين",
                "category": "التبغ والشيشة",
                "base_price": "45.00",
                "kitchen_station": "bar",
                "excise_category": "shisha",
            },
        ]
        for item_data in menu_item_seed:
            category = category_objs[item_data["category"]]
            base_price = Decimal(item_data["base_price"])
            menu_item, _ = MenuItem.objects.get_or_create(
                branch=branch,
                code=item_data["code"],
                defaults={
                    "category": category,
                    "name": item_data["name"],
                    "base_price": base_price,
                    "excise_category": item_data.get("excise_category", ""),
                    "kitchen_station": item_data["kitchen_station"],
                    "is_active": True,
                },
            )

            item_updates = []
            if menu_item.category_id != category.id:
                menu_item.category = category
                item_updates.append("category")
            if menu_item.name != item_data["name"]:
                menu_item.name = item_data["name"]
                item_updates.append("name")
            if menu_item.base_price != base_price:
                menu_item.base_price = base_price
                item_updates.append("base_price")
            if menu_item.excise_category != item_data.get("excise_category", ""):
                menu_item.excise_category = item_data.get("excise_category", "")
                item_updates.append("excise_category")
            if menu_item.kitchen_station != item_data["kitchen_station"]:
                menu_item.kitchen_station = item_data["kitchen_station"]
                item_updates.append("kitchen_station")
            if not menu_item.is_active:
                menu_item.is_active = True
                item_updates.append("is_active")
            if item_updates:
                menu_item.save(update_fields=item_updates + ["updated_at"])

            PriceListItem.objects.update_or_create(
                price_list=price_list,
                menu_item=menu_item,
                defaults={"price": base_price},
            )

        modifier_seed = [
            {
                "name": "اختر الحجم",
                "required": True,
                "min_select": 1,
                "max_select": 1,
                "items": [("صغير", "0.00"), ("وسط", "3.00"), ("كبير", "6.00")],
            },
            {
                "name": "إضافات",
                "required": False,
                "min_select": 0,
                "max_select": 3,
                "items": [("جبنة إضافية", "4.00"), ("صوص إضافي", "2.00"), ("بدون بصل", "0.00")],
            },
        ]
        for group_data in modifier_seed:
            group_obj, _ = ModifierGroup.objects.get_or_create(
                branch=branch,
                name=group_data["name"],
                defaults={
                    "required": group_data["required"],
                    "min_select": group_data["min_select"],
                    "max_select": group_data["max_select"],
                },
            )
            group_updates = []
            for field_name in ("required", "min_select", "max_select"):
                if getattr(group_obj, field_name) != group_data[field_name]:
                    setattr(group_obj, field_name, group_data[field_name])
                    group_updates.append(field_name)
            if group_updates:
                group_obj.save(update_fields=group_updates + ["updated_at"])

            for item_name, delta in group_data["items"]:
                ModifierItem.objects.update_or_create(
                    group=group_obj,
                    name=item_name,
                    defaults={"price_delta": Decimal(delta), "is_active": True},
                )

        combo_obj, _ = ComboBundle.objects.get_or_create(branch=branch, name="وجبة عائلية", defaults={"is_active": True})
        combo_codes = ["APP-HUMMUS", "GRILL-MIX", "DRINK-COLA", "DESS-KUNAFA"]
        for combo_code in combo_codes:
            combo_item = MenuItem.objects.filter(branch=branch, code=combo_code).first()
            if combo_item:
                ComboBundleItem.objects.get_or_create(combo=combo_obj, menu_item=combo_item, defaults={"quantity": 1})

        customer_seed = [
            {"name": "أحمد صالح", "phone": "0500000001", "notes": "بدون مكسرات"},
            {"name": "سارة علي", "phone": "0500000002", "notes": "يفضل طاولة هادئة"},
            {"name": "محمد ناصر", "phone": "0500000003", "notes": ""},
        ]
        for customer_data in customer_seed:
            customer_obj, _ = Customer.objects.get_or_create(
                branch=branch,
                name=customer_data["name"],
                defaults={"phone": customer_data["phone"], "notes": customer_data["notes"]},
            )
            customer_updates = []
            if customer_obj.phone != customer_data["phone"]:
                customer_obj.phone = customer_data["phone"]
                customer_updates.append("phone")
            if customer_obj.notes != customer_data["notes"]:
                customer_obj.notes = customer_data["notes"]
                customer_updates.append("notes")
            if customer_updates:
                customer_obj.save(update_fields=customer_updates + ["updated_at"])
            Address.objects.get_or_create(
                customer=customer_obj,
                line1=f"{customer_data['name']} - العنوان 1",
                defaults={"label": "المنزل", "city": "الرياض"},
            )

        driver_seed = [
            {"name": "السائق الأول", "phone": "0550000001"},
            {"name": "السائق الثاني", "phone": "0550000002"},
        ]
        for driver_data in driver_seed:
            Driver.objects.update_or_create(
                branch=branch,
                name=driver_data["name"],
                defaults={"phone": driver_data["phone"], "is_active": True},
            )

        tax_profile, _ = TaxProfile.objects.get_or_create(branch=branch, name="ضريبة 15%")
        TaxRule.objects.get_or_create(
            tax_profile=tax_profile,
            code="VAT15",
            defaults={"rate_percent": Decimal("15.00"), "is_inclusive": False},
        )

        service_rule, _ = ServiceChargeRule.objects.get_or_create(
            branch=branch,
            name="رسوم خدمة 10%",
            defaults={"charge_type": "percentage", "value": Decimal("10.00")},
        )
        discount_policy, _ = DiscountPolicy.objects.get_or_create(
            branch=branch,
            name="خصم أساسي 15%",
            defaults={"max_discount_percent": Decimal("15.00"), "requires_manager_override": True, "is_active": True},
        )

        for coupon_code in range(100, 111):
            code_text = str(coupon_code)
            ErpCoupon.objects.update_or_create(
                branch=branch,
                external_id=f"seed-coupon-{code_text}",
                defaults={
                    "code": code_text,
                    "title": f"كوبون {code_text}",
                    "description": f"كوبون تجريبي برمز {code_text}",
                    "discount_type": ErpCoupon.DiscountType.PERCENT,
                    "discount_value": Decimal("10.00"),
                    "min_order_amount": Decimal("0.00"),
                    "max_discount_amount": Decimal("50.00"),
                    "usage_limit": 0,
                    "per_customer_limit": 0,
                    "is_active": True,
                    "metadata": {"seeded": True, "source": "seed_pos_demo"},
                    "raw_payload": {"code": code_text, "title": f"كوبون {code_text}"},
                },
            )

        for code, channel_obj in channel_objs.items():
            ChannelConfig.objects.update_or_create(
                branch=branch,
                channel=channel_obj,
                defaults={
                    "price_list": price_list,
                    "tax_profile": tax_profile,
                    "service_charge_rule": service_rule,
                    "discount_policy": discount_policy,
                    "is_enabled": True,
                    "allow_new_orders": True,
                    "availability_rules": {},
                    "printing_routing": {"kitchen": "kitchen_printer_1", "receipt": "receipt_printer_1"},
                    "config_version": 1,
                },
            )

        ConfigVersion.objects.get_or_create(branch=branch, defaults={"version": 1})

        self.stdout.write(self.style.SUCCESS("Seeded demo POS data."))
        self.stdout.write("Admin: admin / admin123")
        self.stdout.write("Cashier: cashier / cashier123")
        self.stdout.write("Waiter: waiter / waiter123")
        self.stdout.write("Cook: cook / cook123")
        self.stdout.write("Supervisor: supervisor / supervisor123")
        self.stdout.write(f"Device token: {device.token}")

