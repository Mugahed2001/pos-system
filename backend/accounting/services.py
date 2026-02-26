from decimal import Decimal

from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone

from .models import AccountDefaults, AccountJournal, AccountMove, AccountMoveLine
from transactions.models import Transaction


class AccountingError(Exception):
    pass


def _get_defaults(subsidiary_id):
    defaults = (
        AccountDefaults.objects.select_related(
            "sales_journal",
            "sales_account",
            "cash_account",
            "receivable_account",
            "tax_account",
            "discount_account",
        )
        .filter(subsidiary_id=subsidiary_id)
        .first()
    )
    if not defaults:
        raise AccountingError("Account defaults are not configured.")
    return defaults


def _get_sales_journal(defaults, subsidiary_id):
    if defaults.sales_journal_id:
        return defaults.sales_journal
    journal = (
        AccountJournal.objects.filter(
            subsidiary_id=subsidiary_id,
            journal_type="sale",
            is_active=True,
        )
        .order_by("code")
        .first()
    )
    if not journal:
        raise AccountingError("No active sales journal found.")
    return journal


@db_transaction.atomic
def _next_move_number(journal):
    journal = AccountJournal.objects.select_for_update().get(pk=journal.pk)
    number = journal.next_number
    journal.next_number = number + 1
    journal.save(update_fields=["next_number"])
    if journal.sequence_prefix:
        return f"{journal.sequence_prefix}{number:06d}"
    return str(number)


def _update_move_totals(move):
    totals = move.lines.aggregate(
        debit=Sum("debit"),
        credit=Sum("credit"),
    )
    total_debit = totals["debit"] or Decimal("0")
    total_credit = totals["credit"] or Decimal("0")
    move.total_debit = total_debit
    move.total_credit = total_credit
    move.amount_total = total_debit
    move.save(update_fields=["total_debit", "total_credit", "amount_total"])


@db_transaction.atomic
def create_move_for_transaction(transaction_id):
    trx = (
        Transaction.objects.select_for_update()
        .select_related("subsidiary", "customer")
        .get(pk=transaction_id)
    )
    existing = AccountMove.objects.filter(transaction=trx).first()
    if existing:
        return existing

    defaults = _get_defaults(trx.subsidiary_id)
    journal = _get_sales_journal(defaults, trx.subsidiary_id)
    move_number = _next_move_number(journal)

    move_date = timezone.localdate()
    if trx.trx_date:
        move_date = trx.trx_date.date()

    move = AccountMove.objects.create(
        subsidiary=trx.subsidiary,
        journal=journal,
        transaction=trx,
        move_number=move_number,
        move_date=move_date,
        ref=trx.trx_number,
        state="draft",
    )

    total_amount = Decimal(trx.total_amount or 0)
    total_tax = Decimal(trx.total_tax or 0)
    total_discount = Decimal(trx.total_discount or 0)
    revenue_amount = total_amount - total_tax + total_discount

    debit_account = defaults.cash_account or defaults.receivable_account
    if not debit_account:
        raise AccountingError("Cash or receivable account is required.")

    lines = [
        AccountMoveLine(
            move=move,
            account=debit_account,
            customer=trx.customer,
            label="POS Receipt",
            debit=total_amount,
            credit=Decimal("0"),
        )
    ]

    if revenue_amount:
        lines.append(
            AccountMoveLine(
                move=move,
                account=defaults.sales_account,
                customer=trx.customer,
                label="Sales Revenue",
                debit=Decimal("0"),
                credit=revenue_amount,
            )
        )

    if total_tax and defaults.tax_account_id:
        lines.append(
            AccountMoveLine(
                move=move,
                account=defaults.tax_account,
                customer=trx.customer,
                label="Output Tax",
                debit=Decimal("0"),
                credit=total_tax,
            )
        )

    if total_discount and defaults.discount_account_id:
        lines.append(
            AccountMoveLine(
                move=move,
                account=defaults.discount_account,
                customer=trx.customer,
                label="Discount",
                debit=total_discount,
                credit=Decimal("0"),
            )
        )

    AccountMoveLine.objects.bulk_create(lines)
    _update_move_totals(move)
    return move


@db_transaction.atomic
def post_move(move_id):
    move = AccountMove.objects.select_for_update().get(pk=move_id)
    if move.state == "posted":
        return move

    _update_move_totals(move)
    if move.total_debit != move.total_credit:
        raise AccountingError("Move is not balanced.")

    move.state = "posted"
    move.posted_at = timezone.now()
    move.save(update_fields=["state", "posted_at"])
    return move
