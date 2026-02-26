import uuid

from django.db import models # pyright: ignore[reportMissingModuleSource]
from django.utils import timezone # pyright: ignore[reportMissingModuleSource]


class Account(models.Model):
    account_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="ACCOUNT_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    code = models.TextField(db_column="CODE")
    name = models.TextField(db_column="NAME")
    account_type = models.TextField(db_column="TYPE", blank=True, null=True)

    class Meta:
        managed = False
        db_table = "ACCOUNTS"


class AccountingPeriod(models.Model):
    period_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="PERIOD_ID",
    )
    name = models.TextField(db_column="NAME", blank=True, null=True)
    start_date = models.DateField(db_column="START_DATE", blank=True, null=True)
    end_date = models.DateField(db_column="END_DATE", blank=True, null=True)
    is_closed = models.BooleanField(db_column="IS_CLOSED", default=False)

    class Meta:
        managed = False
        db_table = "ACCOUNTING_PERIODS"


class TransactionAccountingLine(models.Model):
    acc_line_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="ACC_LINE_ID",
    )
    transaction = models.ForeignKey(
        "transactions.Transaction",
        db_column="TRANSACTION_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    account = models.ForeignKey(
        "accounting.Account",
        db_column="ACCOUNT_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    debit = models.DecimalField(
        db_column="DEBIT",
        max_digits=12,
        decimal_places=2,
        default=0,
    )
    credit = models.DecimalField(
        db_column="CREDIT",
        max_digits=12,
        decimal_places=2,
        default=0,
    )

    class Meta:
        managed = False
        db_table = "TRANSACTION_ACCOUNTING_LINES"


class CommissionPlan(models.Model):
    plan_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="PLAN_ID",
    )
    name = models.TextField(db_column="NAME", blank=True, null=True)
    target_amount = models.DecimalField(
        db_column="TARGET_AMOUNT",
        max_digits=12,
        decimal_places=2,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "COMMISSION_PLAN"


class CommissionRate(models.Model):
    rate_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="RATE_ID",
    )
    plan = models.ForeignKey(
        "accounting.CommissionPlan",
        db_column="PLAN_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    percentage = models.DecimalField(
        db_column="PERCENTAGE",
        max_digits=5,
        decimal_places=2,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "COMMISSION_RATE"


class TimeAttendanceRegister(models.Model):
    attendance_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="ATTENDANCE_ID",
    )
    user = models.ForeignKey(
        "security.FndUser",
        db_column="USER_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    check_in = models.DateTimeField(
        db_column="CHECK_IN",
        blank=True,
        null=True,
    )
    check_out = models.DateTimeField(
        db_column="CHECK_OUT",
        blank=True,
        null=True,
    )
    location = models.ForeignKey(
        "tenants.Location",
        db_column="LOCATION_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "TIME_ATTENDANCE_REGISTER"


class Audit(models.Model):
    audit_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="AUDIT_ID",
    )
    table_name = models.TextField(db_column="TABLE_NAME", blank=True, null=True)
    record_id = models.UUIDField(db_column="RECORD_ID", blank=True, null=True)
    action = models.TextField(db_column="ACTION", blank=True, null=True)
    old_values = models.JSONField(db_column="OLD_VALUES", blank=True, null=True)
    new_values = models.JSONField(db_column="NEW_VALUES", blank=True, null=True)
    changed_by = models.UUIDField(db_column="CHANGED_BY", blank=True, null=True)
    changed_at = models.DateTimeField(
        db_column="CHANGED_AT",
        default=timezone.now,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "AUDITS"


class DebugLog(models.Model):
    log_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="LOG_ID",
    )
    message = models.TextField(db_column="MESSAGE", blank=True, null=True)
    error_code = models.TextField(db_column="ERROR_CODE", blank=True, null=True)
    created_at = models.DateTimeField(
        db_column="CREATED_AT",
        default=timezone.now,
        blank=True,
        null=True,
    )

    class Meta:
        managed = False
        db_table = "DEBUG_LOG"


class AccountJournal(models.Model):
    journal_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="JOURNAL_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    code = models.TextField(db_column="CODE")
    name = models.TextField(db_column="NAME")
    journal_type = models.TextField(db_column="JOURNAL_TYPE")
    sequence_prefix = models.TextField(
        db_column="SEQUENCE_PREFIX",
        blank=True,
        null=True,
    )
    next_number = models.IntegerField(db_column="NEXT_NUMBER", default=1)
    is_active = models.BooleanField(db_column="IS_ACTIVE", default=True)
    created_at = models.DateTimeField(
        db_column="CREATED_AT",
        default=timezone.now,
        blank=True,
        null=True,
    )

    class Meta:
        db_table = "ACCOUNT_JOURNALS"
        indexes = [
            models.Index(fields=["subsidiary", "code"], name="idx_journal_sub_code"),
            models.Index(fields=["journal_type"], name="idx_journal_type"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["subsidiary", "code"],
                name="uq_journal_sub_code",
            )
        ]


class AccountDefaults(models.Model):
    default_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="DEFAULT_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
    )
    sales_journal = models.ForeignKey(
        "accounting.AccountJournal",
        db_column="SALES_JOURNAL_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    sales_account = models.ForeignKey(
        "accounting.Account",
        db_column="SALES_ACCOUNT_ID",
        on_delete=models.DO_NOTHING,
        related_name="defaults_sales_account",
    )
    cash_account = models.ForeignKey(
        "accounting.Account",
        db_column="CASH_ACCOUNT_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
        related_name="defaults_cash_account",
    )
    receivable_account = models.ForeignKey(
        "accounting.Account",
        db_column="RECEIVABLE_ACCOUNT_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
        related_name="defaults_receivable_account",
    )
    tax_account = models.ForeignKey(
        "accounting.Account",
        db_column="TAX_ACCOUNT_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
        related_name="defaults_tax_account",
    )
    discount_account = models.ForeignKey(
        "accounting.Account",
        db_column="DISCOUNT_ACCOUNT_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
        related_name="defaults_discount_account",
    )
    created_at = models.DateTimeField(
        db_column="CREATED_AT",
        default=timezone.now,
        blank=True,
        null=True,
    )

    class Meta:
        db_table = "ACCOUNT_DEFAULTS"
        constraints = [
            models.UniqueConstraint(
                fields=["subsidiary"],
                name="uq_account_defaults_sub",
            )
        ]


class AccountTaxGroup(models.Model):
    group_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="GROUP_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    name = models.TextField(db_column="NAME")
    code = models.TextField(db_column="CODE", blank=True, null=True)
    is_active = models.BooleanField(db_column="IS_ACTIVE", default=True)

    class Meta:
        db_table = "ACCOUNT_TAX_GROUPS"
        indexes = [
            models.Index(fields=["subsidiary", "code"], name="idx_tax_group_sub"),
        ]


class AccountTax(models.Model):
    tax_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="TAX_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    group = models.ForeignKey(
        "accounting.AccountTaxGroup",
        db_column="GROUP_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    name = models.TextField(db_column="NAME")
    tax_type = models.TextField(db_column="TAX_TYPE", default="percent")
    amount = models.DecimalField(
        db_column="AMOUNT",
        max_digits=7,
        decimal_places=4,
        default=0,
    )
    account = models.ForeignKey(
        "accounting.Account",
        db_column="ACCOUNT_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    is_active = models.BooleanField(db_column="IS_ACTIVE", default=True)

    class Meta:
        db_table = "ACCOUNT_TAXES"
        indexes = [
            models.Index(fields=["subsidiary", "tax_type"], name="idx_tax_sub_type"),
        ]


class AccountTaxTag(models.Model):
    tag_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="TAG_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    name = models.TextField(db_column="NAME")
    code = models.TextField(db_column="CODE", blank=True, null=True)
    is_active = models.BooleanField(db_column="IS_ACTIVE", default=True)

    class Meta:
        db_table = "ACCOUNT_TAX_TAGS"


class AccountTaxTagRel(models.Model):
    rel_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="REL_ID",
    )
    tax = models.ForeignKey(
        "accounting.AccountTax",
        db_column="TAX_ID",
        on_delete=models.CASCADE,
    )
    tag = models.ForeignKey(
        "accounting.AccountTaxTag",
        db_column="TAG_ID",
        on_delete=models.CASCADE,
    )

    class Meta:
        db_table = "ACCOUNT_TAX_TAG_REL"
        constraints = [
            models.UniqueConstraint(
                fields=["tax", "tag"],
                name="uq_tax_tag_rel",
            )
        ]


class AccountMove(models.Model):
    move_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="MOVE_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
    )
    journal = models.ForeignKey(
        "accounting.AccountJournal",
        db_column="JOURNAL_ID",
        on_delete=models.DO_NOTHING,
    )
    period = models.ForeignKey(
        "accounting.AccountingPeriod",
        db_column="PERIOD_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    transaction = models.ForeignKey(
        "transactions.Transaction",
        db_column="TRANSACTION_ID",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    move_number = models.TextField(db_column="MOVE_NUMBER")
    move_date = models.DateField(db_column="MOVE_DATE", default=timezone.localdate)
    ref = models.TextField(db_column="REF", blank=True, null=True)
    state = models.TextField(db_column="STATE", default="draft")
    created_by = models.UUIDField(
        db_column="CREATED_BY",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(
        db_column="CREATED_AT",
        default=timezone.now,
    )
    posted_at = models.DateTimeField(
        db_column="POSTED_AT",
        blank=True,
        null=True,
    )
    total_debit = models.DecimalField(
        db_column="TOTAL_DEBIT",
        max_digits=18,
        decimal_places=2,
        default=0,
    )
    total_credit = models.DecimalField(
        db_column="TOTAL_CREDIT",
        max_digits=18,
        decimal_places=2,
        default=0,
    )
    amount_total = models.DecimalField(
        db_column="AMOUNT_TOTAL",
        max_digits=18,
        decimal_places=2,
        default=0,
    )
    currency = models.ForeignKey(
        "tenants.Currency",
        db_column="CURRENCY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )

    class Meta:
        db_table = "ACCOUNT_MOVES"
        indexes = [
            models.Index(fields=["subsidiary", "move_date"], name="idx_move_sub_date"),
            models.Index(fields=["journal", "move_date"], name="idx_move_journal_date"),
            models.Index(fields=["state", "move_date"], name="idx_move_state_date"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["journal", "move_number"],
                name="uq_move_journal_number",
            )
        ]


class AccountMoveLine(models.Model):
    line_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="LINE_ID",
    )
    move = models.ForeignKey(
        "accounting.AccountMove",
        db_column="MOVE_ID",
        on_delete=models.CASCADE,
        related_name="lines",
    )
    account = models.ForeignKey(
        "accounting.Account",
        db_column="ACCOUNT_ID",
        on_delete=models.DO_NOTHING,
    )
    customer = models.ForeignKey(
        "customers.Customer",
        db_column="CUSTOMER_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    label = models.TextField(db_column="LABEL", blank=True, null=True)
    debit = models.DecimalField(
        db_column="DEBIT",
        max_digits=18,
        decimal_places=2,
        default=0,
    )
    credit = models.DecimalField(
        db_column="CREDIT",
        max_digits=18,
        decimal_places=2,
        default=0,
    )
    currency = models.ForeignKey(
        "tenants.Currency",
        db_column="CURRENCY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    amount_currency = models.DecimalField(
        db_column="AMOUNT_CURRENCY",
        max_digits=18,
        decimal_places=2,
        blank=True,
        null=True,
    )
    maturity_date = models.DateField(
        db_column="MATURITY_DATE",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(
        db_column="CREATED_AT",
        default=timezone.now,
    )

    class Meta:
        db_table = "ACCOUNT_MOVE_LINES"
        indexes = [
            models.Index(fields=["account", "move"], name="idx_line_account_move"),
            models.Index(fields=["customer"], name="idx_line_customer"),
            models.Index(fields=["maturity_date"], name="idx_line_maturity"),
        ]


class AccountMoveLineTax(models.Model):
    line_tax_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="LINE_TAX_ID",
    )
    move_line = models.ForeignKey(
        "accounting.AccountMoveLine",
        db_column="LINE_ID",
        on_delete=models.CASCADE,
    )
    tax = models.ForeignKey(
        "accounting.AccountTax",
        db_column="TAX_ID",
        on_delete=models.CASCADE,
    )

    class Meta:
        db_table = "ACCOUNT_MOVE_LINE_TAXES"
        constraints = [
            models.UniqueConstraint(
                fields=["move_line", "tax"],
                name="uq_line_tax",
            )
        ]


class AccountPayment(models.Model):
    payment_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="PAYMENT_ID",
    )
    subsidiary = models.ForeignKey(
        "tenants.Subsidiary",
        db_column="SUBSIDIARY_ID",
        on_delete=models.DO_NOTHING,
    )
    journal = models.ForeignKey(
        "accounting.AccountJournal",
        db_column="JOURNAL_ID",
        on_delete=models.DO_NOTHING,
    )
    payment_date = models.DateField(db_column="PAYMENT_DATE", default=timezone.localdate)
    amount = models.DecimalField(
        db_column="AMOUNT",
        max_digits=18,
        decimal_places=2,
    )
    currency = models.ForeignKey(
        "tenants.Currency",
        db_column="CURRENCY_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    payment_type = models.TextField(db_column="PAYMENT_TYPE")
    partner_type = models.TextField(db_column="PARTNER_TYPE", blank=True, null=True)
    customer = models.ForeignKey(
        "customers.Customer",
        db_column="CUSTOMER_ID",
        on_delete=models.DO_NOTHING,
        blank=True,
        null=True,
    )
    transaction = models.ForeignKey(
        "transactions.Transaction",
        db_column="TRANSACTION_ID",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    move = models.ForeignKey(
        "accounting.AccountMove",
        db_column="MOVE_ID",
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
    )
    state = models.TextField(db_column="STATE", default="draft")
    reference = models.TextField(db_column="REFERENCE", blank=True, null=True)
    created_at = models.DateTimeField(
        db_column="CREATED_AT",
        default=timezone.now,
    )
    posted_at = models.DateTimeField(
        db_column="POSTED_AT",
        blank=True,
        null=True,
    )

    class Meta:
        db_table = "ACCOUNT_PAYMENTS"
        indexes = [
            models.Index(fields=["subsidiary", "payment_date"], name="idx_pay_sub_date"),
            models.Index(fields=["journal", "payment_date"], name="idx_pay_journal_date"),
            models.Index(fields=["state"], name="idx_pay_state"),
        ]


class AccountPartialReconcile(models.Model):
    partial_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="PARTIAL_ID",
    )
    debit_move_line = models.ForeignKey(
        "accounting.AccountMoveLine",
        db_column="DEBIT_MOVE_LINE_ID",
        on_delete=models.CASCADE,
        related_name="partial_debits",
    )
    credit_move_line = models.ForeignKey(
        "accounting.AccountMoveLine",
        db_column="CREDIT_MOVE_LINE_ID",
        on_delete=models.CASCADE,
        related_name="partial_credits",
    )
    amount = models.DecimalField(
        db_column="AMOUNT",
        max_digits=18,
        decimal_places=2,
    )
    created_at = models.DateTimeField(
        db_column="CREATED_AT",
        default=timezone.now,
    )

    class Meta:
        db_table = "ACCOUNT_PARTIAL_RECONCILES"


class AccountFullReconcile(models.Model):
    full_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="FULL_ID",
    )
    created_at = models.DateTimeField(
        db_column="CREATED_AT",
        default=timezone.now,
    )

    class Meta:
        db_table = "ACCOUNT_FULL_RECONCILES"


class AccountFullReconcileLine(models.Model):
    line_id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        db_column="LINE_ID",
    )
    full_reconcile = models.ForeignKey(
        "accounting.AccountFullReconcile",
        db_column="FULL_ID",
        on_delete=models.CASCADE,
        related_name="lines",
    )
    move_line = models.ForeignKey(
        "accounting.AccountMoveLine",
        db_column="MOVE_LINE_ID",
        on_delete=models.CASCADE,
    )

    class Meta:
        db_table = "ACCOUNT_FULL_RECONCILE_LINES"
        constraints = [
            models.UniqueConstraint(
                fields=["full_reconcile", "move_line"],
                name="uq_full_reconcile_line",
            )
        ]
