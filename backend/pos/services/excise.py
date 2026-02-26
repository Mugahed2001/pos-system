from decimal import Decimal

from pos.models import MenuItem

EXCISE_RATE_BY_CATEGORY: dict[str, Decimal] = {
    MenuItem.ExciseCategory.CARBONATED_DRINKS: Decimal("50.00"),
    MenuItem.ExciseCategory.SWEETENED_DRINKS: Decimal("50.00"),
    MenuItem.ExciseCategory.ENERGY_DRINKS: Decimal("100.00"),
    MenuItem.ExciseCategory.TOBACCO_PRODUCTS: Decimal("100.00"),
    MenuItem.ExciseCategory.SHISHA: Decimal("100.00"),
}


def normalize_excise_category(value: str | None) -> str:
    category = (value or "").strip()
    return category if category in EXCISE_RATE_BY_CATEGORY else ""


def get_excise_rate_percent(category: str | None) -> Decimal:
    normalized = normalize_excise_category(category)
    if not normalized:
        return Decimal("0.00")
    return EXCISE_RATE_BY_CATEGORY[normalized]


def compute_excise_amount(line_subtotal: Decimal, category: str | None) -> Decimal:
    rate = get_excise_rate_percent(category)
    if rate <= 0:
        return Decimal("0.00")
    return (line_subtotal * rate / Decimal("100")).quantize(Decimal("0.01"))
