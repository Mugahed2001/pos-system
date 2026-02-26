--
-- PostgreSQL database dump
--

\restrict xzA5hzedY6YJCiQs3BjmWevWmMF5S9llVZYi51pSxcyxytNenT2cy2yk0AD58ps

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pos_loc; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS pos_loc;


--
-- Name: SCHEMA pos_loc; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA pos_loc IS 'standard public schema';


--
-- Name: PROC_CREATE_INVOICE(uuid, uuid, jsonb, uuid); Type: FUNCTION; Schema: pos_loc; Owner: -
--

CREATE OR REPLACE FUNCTION pos_loc."PROC_CREATE_INVOICE"(p_location_id uuid, p_customer_id uuid, p_items jsonb, p_payment_method_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_trx_id UUID;
    v_sub_id UUID;
    v_item RECORD;
    v_total DECIMAL(12,2) := 0;
BEGIN
    -- الحصول على الشركة من الفرع
    SELECT "SUBSIDIARY_ID" INTO v_sub_id FROM "LOCATIONS" WHERE "LOCATION_ID" = p_location_id;

    -- 1. إنشاء رأس الفاتورة
    INSERT INTO "TRANSACTIONS" (
        "SUBSIDIARY_ID", "LOCATION_ID", "USER_ID", "CUSTOMER_ID", "TRX_NUMBER", "STATUS_ID"
    ) VALUES (
        v_sub_id, p_location_id, auth.uid(), p_customer_id, TO_CHAR(NOW(), 'YYMMDDHHMISS'), 
        (SELECT "STATUS_ID" FROM "TRANSACTION_STATUS" WHERE "CODE" = 'COMPLETED')
    ) RETURNING "TRANSACTION_ID" INTO v_trx_id;

    -- 2. إدخال السطور
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, qty DECIMAL, price DECIMAL)
    LOOP
        INSERT INTO "TRANSACTION_LINES" ("TRANSACTION_ID", "ITEM_ID", "QUANTITY", "UNIT_PRICE")
        VALUES (v_trx_id, v_item.item_id, v_item.qty, v_item.price);
        
        v_total := v_total + (v_item.qty * v_item.price);
    END LOOP;

    -- 3. تحديث الإجمالي
    UPDATE "TRANSACTIONS" SET "TOTAL_AMOUNT" = v_total WHERE "TRANSACTION_ID" = v_trx_id;

    RETURN v_trx_id;
END;
$$;


--
-- Name: fn_deduct_inventory(); Type: FUNCTION; Schema: pos_loc; Owner: -
--

CREATE OR REPLACE FUNCTION pos_loc.fn_deduct_inventory() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE "TRANSACTION_INVENTORY_DETAILS"
    SET "QUANTITY_ON_HAND" = "QUANTITY_ON_HAND" - NEW."QUANTITY",
        "LAST_UPDATED" = NOW()
    WHERE "ITEM_ID" = NEW."ITEM_ID"
      AND "LOCATION_ID" = (SELECT "LOCATION_ID" FROM "TRANSACTIONS" WHERE "TRANSACTION_ID" = NEW."TRANSACTION_ID");
      
    -- تسجيل في اللوج إذا لم يوجد مخزون (اختياري)
    IF NOT FOUND THEN
       -- Logic to create negative stock record
       INSERT INTO "TRANSACTION_INVENTORY_DETAILS" ("LOCATION_ID", "ITEM_ID", "QUANTITY_ON_HAND")
       VALUES ((SELECT "LOCATION_ID" FROM "TRANSACTIONS" WHERE "TRANSACTION_ID" = NEW."TRANSACTION_ID"), NEW."ITEM_ID", -NEW."QUANTITY");
    END IF;

    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ACCOUNTING_PERIODS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNTING_PERIODS" (
    "PERIOD_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "NAME" text,
    "START_DATE" date,
    "END_DATE" date,
    "IS_CLOSED" boolean DEFAULT false
);


--
-- Name: ACCOUNTS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNTS" (
    "ACCOUNT_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "SUBSIDIARY_ID" uuid,
    "CODE" text NOT NULL,
    "NAME" text NOT NULL,
    "TYPE" text
);


--
-- Name: ACCOUNT_DEFAULTS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_DEFAULTS" (
    "DEFAULT_ID" uuid NOT NULL,
    "CREATED_AT" timestamp with time zone,
    "CASH_ACCOUNT_ID" uuid,
    "DISCOUNT_ACCOUNT_ID" uuid,
    "RECEIVABLE_ACCOUNT_ID" uuid,
    "SALES_ACCOUNT_ID" uuid NOT NULL,
    "SUBSIDIARY_ID" uuid NOT NULL,
    "TAX_ACCOUNT_ID" uuid,
    "SALES_JOURNAL_ID" uuid
);


--
-- Name: ACCOUNT_FULL_RECONCILES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_FULL_RECONCILES" (
    "FULL_ID" uuid NOT NULL,
    "CREATED_AT" timestamp with time zone NOT NULL
);


--
-- Name: ACCOUNT_FULL_RECONCILE_LINES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_FULL_RECONCILE_LINES" (
    "LINE_ID" uuid NOT NULL,
    "FULL_ID" uuid NOT NULL,
    "MOVE_LINE_ID" uuid NOT NULL
);


--
-- Name: ACCOUNT_JOURNALS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_JOURNALS" (
    "JOURNAL_ID" uuid NOT NULL,
    "CODE" text NOT NULL,
    "NAME" text NOT NULL,
    "JOURNAL_TYPE" text NOT NULL,
    "SEQUENCE_PREFIX" text,
    "NEXT_NUMBER" integer NOT NULL,
    "IS_ACTIVE" boolean NOT NULL,
    "CREATED_AT" timestamp with time zone,
    "SUBSIDIARY_ID" uuid
);


--
-- Name: ACCOUNT_MOVES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_MOVES" (
    "MOVE_ID" uuid NOT NULL,
    "MOVE_NUMBER" text NOT NULL,
    "MOVE_DATE" date NOT NULL,
    "REF" text,
    "STATE" text NOT NULL,
    "CREATED_BY" uuid,
    "CREATED_AT" timestamp with time zone NOT NULL,
    "POSTED_AT" timestamp with time zone,
    "TOTAL_DEBIT" numeric(18,2) NOT NULL,
    "TOTAL_CREDIT" numeric(18,2) NOT NULL,
    "AMOUNT_TOTAL" numeric(18,2) NOT NULL,
    "CURRENCY_ID" uuid,
    "JOURNAL_ID" uuid NOT NULL,
    "PERIOD_ID" uuid,
    "SUBSIDIARY_ID" uuid NOT NULL,
    "TRANSACTION_ID" uuid
);


--
-- Name: ACCOUNT_MOVE_LINES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_MOVE_LINES" (
    "LINE_ID" uuid NOT NULL,
    "LABEL" text,
    "DEBIT" numeric(18,2) NOT NULL,
    "CREDIT" numeric(18,2) NOT NULL,
    "AMOUNT_CURRENCY" numeric(18,2),
    "MATURITY_DATE" date,
    "CREATED_AT" timestamp with time zone NOT NULL,
    "ACCOUNT_ID" uuid NOT NULL,
    "CURRENCY_ID" uuid,
    "CUSTOMER_ID" uuid,
    "MOVE_ID" uuid NOT NULL
);


--
-- Name: ACCOUNT_MOVE_LINE_TAXES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_MOVE_LINE_TAXES" (
    "LINE_TAX_ID" uuid NOT NULL,
    "LINE_ID" uuid NOT NULL,
    "TAX_ID" uuid NOT NULL
);


--
-- Name: ACCOUNT_PARTIAL_RECONCILES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_PARTIAL_RECONCILES" (
    "PARTIAL_ID" uuid NOT NULL,
    "AMOUNT" numeric(18,2) NOT NULL,
    "CREATED_AT" timestamp with time zone NOT NULL,
    "CREDIT_MOVE_LINE_ID" uuid NOT NULL,
    "DEBIT_MOVE_LINE_ID" uuid NOT NULL
);


--
-- Name: ACCOUNT_PAYMENTS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_PAYMENTS" (
    "PAYMENT_ID" uuid NOT NULL,
    "PAYMENT_DATE" date NOT NULL,
    "AMOUNT" numeric(18,2) NOT NULL,
    "PAYMENT_TYPE" text NOT NULL,
    "PARTNER_TYPE" text,
    "STATE" text NOT NULL,
    "REFERENCE" text,
    "CREATED_AT" timestamp with time zone NOT NULL,
    "POSTED_AT" timestamp with time zone,
    "CURRENCY_ID" uuid,
    "CUSTOMER_ID" uuid,
    "JOURNAL_ID" uuid NOT NULL,
    "MOVE_ID" uuid,
    "SUBSIDIARY_ID" uuid NOT NULL,
    "TRANSACTION_ID" uuid
);


--
-- Name: ACCOUNT_TAXES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_TAXES" (
    "TAX_ID" uuid NOT NULL,
    "NAME" text NOT NULL,
    "TAX_TYPE" text NOT NULL,
    "AMOUNT" numeric(7,4) NOT NULL,
    "IS_ACTIVE" boolean NOT NULL,
    "ACCOUNT_ID" uuid,
    "SUBSIDIARY_ID" uuid,
    "GROUP_ID" uuid
);


--
-- Name: ACCOUNT_TAX_GROUPS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_TAX_GROUPS" (
    "GROUP_ID" uuid NOT NULL,
    "NAME" text NOT NULL,
    "CODE" text,
    "IS_ACTIVE" boolean NOT NULL,
    "SUBSIDIARY_ID" uuid
);


--
-- Name: ACCOUNT_TAX_TAGS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_TAX_TAGS" (
    "TAG_ID" uuid NOT NULL,
    "NAME" text NOT NULL,
    "CODE" text,
    "IS_ACTIVE" boolean NOT NULL,
    "SUBSIDIARY_ID" uuid
);


--
-- Name: ACCOUNT_TAX_TAG_REL; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ACCOUNT_TAX_TAG_REL" (
    "REL_ID" uuid NOT NULL,
    "TAG_ID" uuid NOT NULL,
    "TAX_ID" uuid NOT NULL
);


--
-- Name: ADDRESS_BOOK; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ADDRESS_BOOK" (
    "ADDRESS_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "ENTITY_ID" uuid,
    "ENTITY_TYPE" text,
    "STREET" text,
    "CITY" text,
    "POSTAL_CODE" text,
    "COUNTRY" text
);


--
-- Name: AUDITS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."AUDITS" (
    "AUDIT_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "TABLE_NAME" text,
    "RECORD_ID" uuid,
    "ACTION" text,
    "OLD_VALUES" jsonb,
    "NEW_VALUES" jsonb,
    "CHANGED_BY" uuid,
    "CHANGED_AT" timestamp with time zone DEFAULT now()
);


--
-- Name: BINS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."BINS" (
    "BIN_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "LOCATION_ID" uuid,
    "BIN_CODE" text
);


--
-- Name: BRANCH_STATIONS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."BRANCH_STATIONS" (
    "STATION_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "LOCATION_ID" uuid,
    "NAME" text NOT NULL,
    "IS_ACTIVE" boolean DEFAULT true,
    "CREATED_AT" timestamp with time zone DEFAULT now()
);


--
-- Name: COMMISSION_PLAN; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."COMMISSION_PLAN" (
    "PLAN_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "NAME" text,
    "TARGET_AMOUNT" numeric(12,2)
);


--
-- Name: COMMISSION_RATE; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."COMMISSION_RATE" (
    "RATE_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "PLAN_ID" uuid,
    "PERCENTAGE" numeric(5,2)
);


--
-- Name: CURRENCIES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."CURRENCIES" (
    "CURRENCY_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "CODE" text NOT NULL,
    "NAME" text,
    "SYMBOL" text
);


--
-- Name: CURRENCY_RATES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."CURRENCY_RATES" (
    "RATE_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "CURRENCY_ID" uuid,
    "RATE" numeric(18,6) NOT NULL,
    "EFFECTIVE_DATE" date DEFAULT CURRENT_DATE
);


--
-- Name: CUSTOMERS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."CUSTOMERS" (
    "CUSTOMER_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "SUBSIDIARY_ID" uuid,
    "NAME" text NOT NULL,
    "PHONE" text,
    "EMAIL" text,
    "VAT_NUMBER" text
);


--
-- Name: DEBUG_LOG; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."DEBUG_LOG" (
    "LOG_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "MESSAGE" text,
    "ERROR_CODE" text,
    "CREATED_AT" timestamp with time zone DEFAULT now()
);


--
-- Name: DISCOUNTS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."DISCOUNTS" (
    "DISCOUNT_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "POLICY_ID" uuid,
    "CODE" text,
    "TYPE" text,
    "VALUE" numeric(12,2)
);


--
-- Name: DISCOUNT_POLICIES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."DISCOUNT_POLICIES" (
    "POLICY_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "SUBSIDIARY_ID" uuid,
    "NAME" text,
    "IS_ACTIVE" boolean
);


--
-- Name: FND_LOVS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."FND_LOVS" (
    "LOV_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "CODE" text NOT NULL,
    "NAME" text
);


--
-- Name: FND_LOVS_VALUES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."FND_LOVS_VALUES" (
    "VALUE_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "LOV_ID" uuid,
    "VALUE" text,
    "LABEL" text
);


--
-- Name: FND_REPORT_PARAMETERS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."FND_REPORT_PARAMETERS" (
    "PARAM_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "REPORT_NAME" text,
    "PARAM_KEY" text,
    "PARAM_LABEL" text
);


--
-- Name: FND_ROLES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."FND_ROLES" (
    "ROLE_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "SUBSIDIARY_ID" uuid,
    "ROLE_NAME" text NOT NULL,
    "CREATED_AT" timestamp with time zone DEFAULT now()
);


--
-- Name: FND_USERS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."FND_USERS" (
    "USER_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "SUBSIDIARY_ID" uuid,
    "ROLE_ID" uuid,
    "USERNAME" text NOT NULL,
    "FULL_NAME" text,
    "EMAIL" text,
    "IS_ACTIVE" boolean DEFAULT true,
    "CREATED_AT" timestamp with time zone DEFAULT now()
);


--
-- Name: ITEMS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ITEMS" (
    "ITEM_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "SUBSIDIARY_ID" uuid,
    "CATEGORY_ID" uuid,
    "UOM_ID" uuid,
    "ITEM_CODE" text NOT NULL,
    "ITEM_NAME" text NOT NULL,
    "BARCODE" text,
    "DESCRIPTION" text,
    "IS_TAXABLE" boolean DEFAULT true,
    "CREATED_AT" timestamp with time zone DEFAULT now()
);


--
-- Name: ITEM_CATEGORY; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ITEM_CATEGORY" (
    "CATEGORY_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "SUBSIDIARY_ID" uuid,
    "NAME" text NOT NULL,
    "PARENT_CATEGORY_ID" uuid
);


--
-- Name: ITEM_PRICE_LIST; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ITEM_PRICE_LIST" (
    "PRICE_LIST_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "ITEM_ID" uuid,
    "LOCATION_ID" uuid,
    "PRICE" numeric(12,2) NOT NULL,
    "START_DATE" date,
    "END_DATE" date
);


--
-- Name: LOCATIONS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."LOCATIONS" (
    "LOCATION_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "SUBSIDIARY_ID" uuid,
    "NAME" text NOT NULL,
    "ADDRESS" text,
    "IS_ACTIVE" boolean DEFAULT true
);


--
-- Name: PAYMENT_METHODS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."PAYMENT_METHODS" (
    "METHOD_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "NAME" text NOT NULL
);


--
-- Name: REWARD_POINTS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."REWARD_POINTS" (
    "REWARD_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "CUSTOMER_ID" uuid,
    "POINTS_BALANCE" integer DEFAULT 0,
    "LAST_UPDATED" timestamp with time zone
);


--
-- Name: SUBSIDIARIES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."SUBSIDIARIES" (
    "SUBSIDIARY_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "NAME" text NOT NULL,
    "TAX_NUMBER" text,
    "COMMERCIAL_REGISTRATION" text,
    "CREATED_AT" timestamp with time zone DEFAULT now()
);


--
-- Name: TAX_ITEMS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TAX_ITEMS" (
    "TAX_ITEM_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "TAX_TYPE_ID" uuid,
    "RATE" numeric(5,2) DEFAULT 15.00
);


--
-- Name: TAX_SA_DOCUMENTS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TAX_SA_DOCUMENTS" (
    "DOC_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "TRANSACTION_ID" uuid,
    "XML_CONTENT" text,
    "HASH" text,
    "QR_CODE" text,
    "ZATCA_STATUS" text
);


--
-- Name: TAX_SA_SETTINGS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TAX_SA_SETTINGS" (
    "SETTING_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "SUBSIDIARY_ID" uuid,
    "STREET_NAME" text,
    "BUILDING_NUMBER" text,
    "PLOT_IDENTIFICATION" text,
    "CITY_SUBDIVISION" text,
    "POSTAL_ZONE" text
);


--
-- Name: TAX_TYPES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TAX_TYPES" (
    "TAX_TYPE_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "NAME" text,
    "CODE" text
);


--
-- Name: TIME_ATTENDANCE_REGISTER; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TIME_ATTENDANCE_REGISTER" (
    "ATTENDANCE_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "USER_ID" uuid,
    "CHECK_IN" timestamp with time zone,
    "CHECK_OUT" timestamp with time zone,
    "LOCATION_ID" uuid
);


--
-- Name: TRANSACTIONS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TRANSACTIONS" (
    "TRANSACTION_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "SUBSIDIARY_ID" uuid,
    "LOCATION_ID" uuid,
    "STATION_ID" uuid,
    "USER_ID" uuid,
    "CUSTOMER_ID" uuid,
    "TRX_NUMBER" text NOT NULL,
    "TRX_DATE" timestamp with time zone DEFAULT now(),
    "STATUS_ID" uuid,
    "TOTAL_AMOUNT" numeric(12,2) DEFAULT 0,
    "TOTAL_TAX" numeric(12,2) DEFAULT 0,
    "TOTAL_DISCOUNT" numeric(12,2) DEFAULT 0,
    "NOTES" text
);


--
-- Name: TRANSACTION_ACCOUNTING_LINES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TRANSACTION_ACCOUNTING_LINES" (
    "ACC_LINE_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "TRANSACTION_ID" uuid,
    "ACCOUNT_ID" uuid,
    "DEBIT" numeric(12,2) DEFAULT 0,
    "CREDIT" numeric(12,2) DEFAULT 0
);


--
-- Name: TRANSACTION_COMMENTS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TRANSACTION_COMMENTS" (
    "COMMENT_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "TRANSACTION_ID" uuid,
    "COMMENT_TEXT" text,
    "CREATED_BY" uuid
);


--
-- Name: TRANSACTION_INVENTORY_BATCH; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TRANSACTION_INVENTORY_BATCH" (
    "BATCH_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "ITEM_ID" uuid,
    "LOCATION_ID" uuid,
    "BATCH_NUMBER" text NOT NULL,
    "EXPIRY_DATE" date,
    "QUANTITY" numeric(12,3)
);


--
-- Name: TRANSACTION_INVENTORY_DETAILS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TRANSACTION_INVENTORY_DETAILS" (
    "DETAIL_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "LOCATION_ID" uuid,
    "ITEM_ID" uuid,
    "QUANTITY_ON_HAND" numeric(12,3) DEFAULT 0,
    "RESERVED_QUANTITY" numeric(12,3) DEFAULT 0,
    "LAST_UPDATED" timestamp with time zone DEFAULT now()
);


--
-- Name: TRANSACTION_LINES; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TRANSACTION_LINES" (
    "LINE_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "TRANSACTION_ID" uuid,
    "ITEM_ID" uuid,
    "UOM_ID" uuid,
    "QUANTITY" numeric(12,3) NOT NULL,
    "UNIT_PRICE" numeric(12,2) NOT NULL,
    "DISCOUNT_AMOUNT" numeric(12,2) DEFAULT 0,
    "TAX_AMOUNT" numeric(12,2) DEFAULT 0,
    "LINE_TOTAL" numeric(12,2) GENERATED ALWAYS AS (((("QUANTITY" * "UNIT_PRICE") - "DISCOUNT_AMOUNT") + "TAX_AMOUNT")) STORED
);


--
-- Name: TRANSACTION_STATUS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TRANSACTION_STATUS" (
    "STATUS_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "CODE" text NOT NULL,
    "NAME" text
);


--
-- Name: TRANSACTION_TAX_DETAILS; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."TRANSACTION_TAX_DETAILS" (
    "TAX_DETAIL_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "TRANSACTION_ID" uuid,
    "TAX_TYPE_ID" uuid,
    "TAXABLE_AMOUNT" numeric(12,2),
    "TAX_AMOUNT" numeric(12,2)
);


--
-- Name: UNITS_TYPE; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."UNITS_TYPE" (
    "UNIT_TYPE_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "NAME" text
);


--
-- Name: UOM; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."UOM" (
    "UOM_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "NAME" text NOT NULL,
    "CODE" text
);


--
-- Name: V_DAILY_SALES_SUMMARY; Type: VIEW; Schema: pos_loc; Owner: -
--

CREATE VIEW pos_loc."V_DAILY_SALES_SUMMARY" AS
 SELECT t."SUBSIDIARY_ID",
    l."NAME" AS "BRANCH_NAME",
    date(t."TRX_DATE") AS "SALE_DATE",
    count(t."TRANSACTION_ID") AS "TOTAL_INVOICES",
    sum(t."TOTAL_AMOUNT") AS "TOTAL_REVENUE",
    sum(t."TOTAL_TAX") AS "TOTAL_VAT"
   FROM (pos_loc."TRANSACTIONS" t
     JOIN pos_loc."LOCATIONS" l ON ((t."LOCATION_ID" = l."LOCATION_ID")))
  WHERE (t."STATUS_ID" IN ( SELECT "TRANSACTION_STATUS"."STATUS_ID"
           FROM pos_loc."TRANSACTION_STATUS"
          WHERE ("TRANSACTION_STATUS"."CODE" = 'COMPLETED'::text)))
  GROUP BY t."SUBSIDIARY_ID", l."NAME", (date(t."TRX_DATE"));


--
-- Name: XX_ITEM_SERIAL_NUMBER; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."XX_ITEM_SERIAL_NUMBER" (
    "SERIAL_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "ITEM_ID" uuid,
    "SERIAL_NUMBER" text NOT NULL,
    "STATUS" text
);


--
-- Name: ZATCA_ONBOARDING; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc."ZATCA_ONBOARDING" (
    "ONBOARD_ID" uuid DEFAULT pos_loc.uuid_generate_v4() NOT NULL,
    "SUBSIDIARY_ID" uuid,
    "LOCATION_ID" uuid,
    "CSR" text,
    "CSID" text,
    "PRIVATE_KEY" text,
    "STATUS" text
);


--
-- Name: auth_group; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc.auth_group (
    id integer NOT NULL,
    name character varying(150) NOT NULL
);


--
-- Name: auth_group_id_seq; Type: SEQUENCE; Schema: pos_loc; Owner: -
--

ALTER TABLE pos_loc.auth_group ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME pos_loc.auth_group_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_group_permissions; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc.auth_group_permissions (
    id bigint NOT NULL,
    group_id integer NOT NULL,
    permission_id integer NOT NULL
);


--
-- Name: auth_group_permissions_id_seq; Type: SEQUENCE; Schema: pos_loc; Owner: -
--

ALTER TABLE pos_loc.auth_group_permissions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME pos_loc.auth_group_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_permission; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc.auth_permission (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    content_type_id integer NOT NULL,
    codename character varying(100) NOT NULL
);


--
-- Name: auth_permission_id_seq; Type: SEQUENCE; Schema: pos_loc; Owner: -
--

ALTER TABLE pos_loc.auth_permission ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME pos_loc.auth_permission_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_user; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc.auth_user (
    id integer NOT NULL,
    password character varying(128) NOT NULL,
    last_login timestamp with time zone,
    is_superuser boolean NOT NULL,
    username character varying(150) NOT NULL,
    first_name character varying(150) NOT NULL,
    last_name character varying(150) NOT NULL,
    email character varying(254) NOT NULL,
    is_staff boolean NOT NULL,
    is_active boolean NOT NULL,
    date_joined timestamp with time zone NOT NULL
);


--
-- Name: auth_user_groups; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc.auth_user_groups (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    group_id integer NOT NULL
);


--
-- Name: auth_user_groups_id_seq; Type: SEQUENCE; Schema: pos_loc; Owner: -
--

ALTER TABLE pos_loc.auth_user_groups ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME pos_loc.auth_user_groups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_user_id_seq; Type: SEQUENCE; Schema: pos_loc; Owner: -
--

ALTER TABLE pos_loc.auth_user ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME pos_loc.auth_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: auth_user_user_permissions; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc.auth_user_user_permissions (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    permission_id integer NOT NULL
);


--
-- Name: auth_user_user_permissions_id_seq; Type: SEQUENCE; Schema: pos_loc; Owner: -
--

ALTER TABLE pos_loc.auth_user_user_permissions ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME pos_loc.auth_user_user_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: django_admin_log; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc.django_admin_log (
    id integer NOT NULL,
    action_time timestamp with time zone NOT NULL,
    object_id text,
    object_repr character varying(200) NOT NULL,
    action_flag smallint NOT NULL,
    change_message text NOT NULL,
    content_type_id integer,
    user_id integer NOT NULL,
    CONSTRAINT django_admin_log_action_flag_check CHECK ((action_flag >= 0))
);


--
-- Name: django_admin_log_id_seq; Type: SEQUENCE; Schema: pos_loc; Owner: -
--

ALTER TABLE pos_loc.django_admin_log ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME pos_loc.django_admin_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: django_content_type; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc.django_content_type (
    id integer NOT NULL,
    app_label character varying(100) NOT NULL,
    model character varying(100) NOT NULL
);


--
-- Name: django_content_type_id_seq; Type: SEQUENCE; Schema: pos_loc; Owner: -
--

ALTER TABLE pos_loc.django_content_type ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME pos_loc.django_content_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: django_migrations; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc.django_migrations (
    id bigint NOT NULL,
    app character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    applied timestamp with time zone NOT NULL
);


--
-- Name: django_migrations_id_seq; Type: SEQUENCE; Schema: pos_loc; Owner: -
--

ALTER TABLE pos_loc.django_migrations ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME pos_loc.django_migrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: django_session; Type: TABLE; Schema: pos_loc; Owner: -
--

CREATE TABLE pos_loc.django_session (
    session_key character varying(40) NOT NULL,
    session_data text NOT NULL,
    expire_date timestamp with time zone NOT NULL
);


--
-- Name: ACCOUNTING_PERIODS ACCOUNTING_PERIODS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNTING_PERIODS"
    ADD CONSTRAINT "ACCOUNTING_PERIODS_pkey" PRIMARY KEY ("PERIOD_ID");


--
-- Name: ACCOUNTS ACCOUNTS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNTS"
    ADD CONSTRAINT "ACCOUNTS_pkey" PRIMARY KEY ("ACCOUNT_ID");


--
-- Name: ACCOUNT_DEFAULTS ACCOUNT_DEFAULTS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_DEFAULTS"
    ADD CONSTRAINT "ACCOUNT_DEFAULTS_pkey" PRIMARY KEY ("DEFAULT_ID");


--
-- Name: ACCOUNT_FULL_RECONCILES ACCOUNT_FULL_RECONCILES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_FULL_RECONCILES"
    ADD CONSTRAINT "ACCOUNT_FULL_RECONCILES_pkey" PRIMARY KEY ("FULL_ID");


--
-- Name: ACCOUNT_FULL_RECONCILE_LINES ACCOUNT_FULL_RECONCILE_LINES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_FULL_RECONCILE_LINES"
    ADD CONSTRAINT "ACCOUNT_FULL_RECONCILE_LINES_pkey" PRIMARY KEY ("LINE_ID");


--
-- Name: ACCOUNT_JOURNALS ACCOUNT_JOURNALS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_JOURNALS"
    ADD CONSTRAINT "ACCOUNT_JOURNALS_pkey" PRIMARY KEY ("JOURNAL_ID");


--
-- Name: ACCOUNT_MOVES ACCOUNT_MOVES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVES"
    ADD CONSTRAINT "ACCOUNT_MOVES_pkey" PRIMARY KEY ("MOVE_ID");


--
-- Name: ACCOUNT_MOVE_LINES ACCOUNT_MOVE_LINES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVE_LINES"
    ADD CONSTRAINT "ACCOUNT_MOVE_LINES_pkey" PRIMARY KEY ("LINE_ID");


--
-- Name: ACCOUNT_MOVE_LINE_TAXES ACCOUNT_MOVE_LINE_TAXES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVE_LINE_TAXES"
    ADD CONSTRAINT "ACCOUNT_MOVE_LINE_TAXES_pkey" PRIMARY KEY ("LINE_TAX_ID");


--
-- Name: ACCOUNT_PARTIAL_RECONCILES ACCOUNT_PARTIAL_RECONCILES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_PARTIAL_RECONCILES"
    ADD CONSTRAINT "ACCOUNT_PARTIAL_RECONCILES_pkey" PRIMARY KEY ("PARTIAL_ID");


--
-- Name: ACCOUNT_PAYMENTS ACCOUNT_PAYMENTS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_PAYMENTS"
    ADD CONSTRAINT "ACCOUNT_PAYMENTS_pkey" PRIMARY KEY ("PAYMENT_ID");


--
-- Name: ACCOUNT_TAXES ACCOUNT_TAXES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAXES"
    ADD CONSTRAINT "ACCOUNT_TAXES_pkey" PRIMARY KEY ("TAX_ID");


--
-- Name: ACCOUNT_TAX_GROUPS ACCOUNT_TAX_GROUPS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAX_GROUPS"
    ADD CONSTRAINT "ACCOUNT_TAX_GROUPS_pkey" PRIMARY KEY ("GROUP_ID");


--
-- Name: ACCOUNT_TAX_TAGS ACCOUNT_TAX_TAGS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAX_TAGS"
    ADD CONSTRAINT "ACCOUNT_TAX_TAGS_pkey" PRIMARY KEY ("TAG_ID");


--
-- Name: ACCOUNT_TAX_TAG_REL ACCOUNT_TAX_TAG_REL_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAX_TAG_REL"
    ADD CONSTRAINT "ACCOUNT_TAX_TAG_REL_pkey" PRIMARY KEY ("REL_ID");


--
-- Name: ADDRESS_BOOK ADDRESS_BOOK_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ADDRESS_BOOK"
    ADD CONSTRAINT "ADDRESS_BOOK_pkey" PRIMARY KEY ("ADDRESS_ID");


--
-- Name: AUDITS AUDITS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."AUDITS"
    ADD CONSTRAINT "AUDITS_pkey" PRIMARY KEY ("AUDIT_ID");


--
-- Name: BINS BINS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."BINS"
    ADD CONSTRAINT "BINS_pkey" PRIMARY KEY ("BIN_ID");


--
-- Name: BRANCH_STATIONS BRANCH_STATIONS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."BRANCH_STATIONS"
    ADD CONSTRAINT "BRANCH_STATIONS_pkey" PRIMARY KEY ("STATION_ID");


--
-- Name: COMMISSION_PLAN COMMISSION_PLAN_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."COMMISSION_PLAN"
    ADD CONSTRAINT "COMMISSION_PLAN_pkey" PRIMARY KEY ("PLAN_ID");


--
-- Name: COMMISSION_RATE COMMISSION_RATE_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."COMMISSION_RATE"
    ADD CONSTRAINT "COMMISSION_RATE_pkey" PRIMARY KEY ("RATE_ID");


--
-- Name: CURRENCIES CURRENCIES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."CURRENCIES"
    ADD CONSTRAINT "CURRENCIES_pkey" PRIMARY KEY ("CURRENCY_ID");


--
-- Name: CURRENCY_RATES CURRENCY_RATES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."CURRENCY_RATES"
    ADD CONSTRAINT "CURRENCY_RATES_pkey" PRIMARY KEY ("RATE_ID");


--
-- Name: CUSTOMERS CUSTOMERS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."CUSTOMERS"
    ADD CONSTRAINT "CUSTOMERS_pkey" PRIMARY KEY ("CUSTOMER_ID");


--
-- Name: DEBUG_LOG DEBUG_LOG_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."DEBUG_LOG"
    ADD CONSTRAINT "DEBUG_LOG_pkey" PRIMARY KEY ("LOG_ID");


--
-- Name: DISCOUNTS DISCOUNTS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."DISCOUNTS"
    ADD CONSTRAINT "DISCOUNTS_pkey" PRIMARY KEY ("DISCOUNT_ID");


--
-- Name: DISCOUNT_POLICIES DISCOUNT_POLICIES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."DISCOUNT_POLICIES"
    ADD CONSTRAINT "DISCOUNT_POLICIES_pkey" PRIMARY KEY ("POLICY_ID");


--
-- Name: FND_LOVS_VALUES FND_LOVS_VALUES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."FND_LOVS_VALUES"
    ADD CONSTRAINT "FND_LOVS_VALUES_pkey" PRIMARY KEY ("VALUE_ID");


--
-- Name: FND_LOVS FND_LOVS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."FND_LOVS"
    ADD CONSTRAINT "FND_LOVS_pkey" PRIMARY KEY ("LOV_ID");


--
-- Name: FND_REPORT_PARAMETERS FND_REPORT_PARAMETERS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."FND_REPORT_PARAMETERS"
    ADD CONSTRAINT "FND_REPORT_PARAMETERS_pkey" PRIMARY KEY ("PARAM_ID");


--
-- Name: FND_ROLES FND_ROLES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."FND_ROLES"
    ADD CONSTRAINT "FND_ROLES_pkey" PRIMARY KEY ("ROLE_ID");


--
-- Name: FND_USERS FND_USERS_EMAIL_key; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."FND_USERS"
    ADD CONSTRAINT "FND_USERS_EMAIL_key" UNIQUE ("EMAIL");


--
-- Name: FND_USERS FND_USERS_USERNAME_key; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."FND_USERS"
    ADD CONSTRAINT "FND_USERS_USERNAME_key" UNIQUE ("USERNAME");


--
-- Name: FND_USERS FND_USERS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."FND_USERS"
    ADD CONSTRAINT "FND_USERS_pkey" PRIMARY KEY ("USER_ID");


--
-- Name: ITEMS ITEMS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ITEMS"
    ADD CONSTRAINT "ITEMS_pkey" PRIMARY KEY ("ITEM_ID");


--
-- Name: ITEM_CATEGORY ITEM_CATEGORY_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ITEM_CATEGORY"
    ADD CONSTRAINT "ITEM_CATEGORY_pkey" PRIMARY KEY ("CATEGORY_ID");


--
-- Name: ITEM_PRICE_LIST ITEM_PRICE_LIST_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ITEM_PRICE_LIST"
    ADD CONSTRAINT "ITEM_PRICE_LIST_pkey" PRIMARY KEY ("PRICE_LIST_ID");


--
-- Name: LOCATIONS LOCATIONS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."LOCATIONS"
    ADD CONSTRAINT "LOCATIONS_pkey" PRIMARY KEY ("LOCATION_ID");


--
-- Name: PAYMENT_METHODS PAYMENT_METHODS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."PAYMENT_METHODS"
    ADD CONSTRAINT "PAYMENT_METHODS_pkey" PRIMARY KEY ("METHOD_ID");


--
-- Name: REWARD_POINTS REWARD_POINTS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."REWARD_POINTS"
    ADD CONSTRAINT "REWARD_POINTS_pkey" PRIMARY KEY ("REWARD_ID");


--
-- Name: SUBSIDIARIES SUBSIDIARIES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."SUBSIDIARIES"
    ADD CONSTRAINT "SUBSIDIARIES_pkey" PRIMARY KEY ("SUBSIDIARY_ID");


--
-- Name: TAX_ITEMS TAX_ITEMS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TAX_ITEMS"
    ADD CONSTRAINT "TAX_ITEMS_pkey" PRIMARY KEY ("TAX_ITEM_ID");


--
-- Name: TAX_SA_DOCUMENTS TAX_SA_DOCUMENTS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TAX_SA_DOCUMENTS"
    ADD CONSTRAINT "TAX_SA_DOCUMENTS_pkey" PRIMARY KEY ("DOC_ID");


--
-- Name: TAX_SA_SETTINGS TAX_SA_SETTINGS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TAX_SA_SETTINGS"
    ADD CONSTRAINT "TAX_SA_SETTINGS_pkey" PRIMARY KEY ("SETTING_ID");


--
-- Name: TAX_TYPES TAX_TYPES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TAX_TYPES"
    ADD CONSTRAINT "TAX_TYPES_pkey" PRIMARY KEY ("TAX_TYPE_ID");


--
-- Name: TIME_ATTENDANCE_REGISTER TIME_ATTENDANCE_REGISTER_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TIME_ATTENDANCE_REGISTER"
    ADD CONSTRAINT "TIME_ATTENDANCE_REGISTER_pkey" PRIMARY KEY ("ATTENDANCE_ID");


--
-- Name: TRANSACTIONS TRANSACTIONS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTIONS"
    ADD CONSTRAINT "TRANSACTIONS_pkey" PRIMARY KEY ("TRANSACTION_ID");


--
-- Name: TRANSACTION_ACCOUNTING_LINES TRANSACTION_ACCOUNTING_LINES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_ACCOUNTING_LINES"
    ADD CONSTRAINT "TRANSACTION_ACCOUNTING_LINES_pkey" PRIMARY KEY ("ACC_LINE_ID");


--
-- Name: TRANSACTION_COMMENTS TRANSACTION_COMMENTS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_COMMENTS"
    ADD CONSTRAINT "TRANSACTION_COMMENTS_pkey" PRIMARY KEY ("COMMENT_ID");


--
-- Name: TRANSACTION_INVENTORY_BATCH TRANSACTION_INVENTORY_BATCH_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_INVENTORY_BATCH"
    ADD CONSTRAINT "TRANSACTION_INVENTORY_BATCH_pkey" PRIMARY KEY ("BATCH_ID");


--
-- Name: TRANSACTION_INVENTORY_DETAILS TRANSACTION_INVENTORY_DETAILS_LOCATION_ID_ITEM_ID_key; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_INVENTORY_DETAILS"
    ADD CONSTRAINT "TRANSACTION_INVENTORY_DETAILS_LOCATION_ID_ITEM_ID_key" UNIQUE ("LOCATION_ID", "ITEM_ID");


--
-- Name: TRANSACTION_INVENTORY_DETAILS TRANSACTION_INVENTORY_DETAILS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_INVENTORY_DETAILS"
    ADD CONSTRAINT "TRANSACTION_INVENTORY_DETAILS_pkey" PRIMARY KEY ("DETAIL_ID");


--
-- Name: TRANSACTION_LINES TRANSACTION_LINES_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_LINES"
    ADD CONSTRAINT "TRANSACTION_LINES_pkey" PRIMARY KEY ("LINE_ID");


--
-- Name: TRANSACTION_STATUS TRANSACTION_STATUS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_STATUS"
    ADD CONSTRAINT "TRANSACTION_STATUS_pkey" PRIMARY KEY ("STATUS_ID");


--
-- Name: TRANSACTION_TAX_DETAILS TRANSACTION_TAX_DETAILS_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_TAX_DETAILS"
    ADD CONSTRAINT "TRANSACTION_TAX_DETAILS_pkey" PRIMARY KEY ("TAX_DETAIL_ID");


--
-- Name: UNITS_TYPE UNITS_TYPE_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."UNITS_TYPE"
    ADD CONSTRAINT "UNITS_TYPE_pkey" PRIMARY KEY ("UNIT_TYPE_ID");


--
-- Name: UOM UOM_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."UOM"
    ADD CONSTRAINT "UOM_pkey" PRIMARY KEY ("UOM_ID");


--
-- Name: XX_ITEM_SERIAL_NUMBER XX_ITEM_SERIAL_NUMBER_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."XX_ITEM_SERIAL_NUMBER"
    ADD CONSTRAINT "XX_ITEM_SERIAL_NUMBER_pkey" PRIMARY KEY ("SERIAL_ID");


--
-- Name: ZATCA_ONBOARDING ZATCA_ONBOARDING_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ZATCA_ONBOARDING"
    ADD CONSTRAINT "ZATCA_ONBOARDING_pkey" PRIMARY KEY ("ONBOARD_ID");


--
-- Name: auth_group auth_group_name_key; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_group
    ADD CONSTRAINT auth_group_name_key UNIQUE (name);


--
-- Name: auth_group_permissions auth_group_permissions_group_id_permission_id_0cd325b0_uniq; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_group_id_permission_id_0cd325b0_uniq UNIQUE (group_id, permission_id);


--
-- Name: auth_group_permissions auth_group_permissions_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_pkey PRIMARY KEY (id);


--
-- Name: auth_group auth_group_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_group
    ADD CONSTRAINT auth_group_pkey PRIMARY KEY (id);


--
-- Name: auth_permission auth_permission_content_type_id_codename_01ab375a_uniq; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_permission
    ADD CONSTRAINT auth_permission_content_type_id_codename_01ab375a_uniq UNIQUE (content_type_id, codename);


--
-- Name: auth_permission auth_permission_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_permission
    ADD CONSTRAINT auth_permission_pkey PRIMARY KEY (id);


--
-- Name: auth_user_groups auth_user_groups_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_user_groups
    ADD CONSTRAINT auth_user_groups_pkey PRIMARY KEY (id);


--
-- Name: auth_user_groups auth_user_groups_user_id_group_id_94350c0c_uniq; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_user_groups
    ADD CONSTRAINT auth_user_groups_user_id_group_id_94350c0c_uniq UNIQUE (user_id, group_id);


--
-- Name: auth_user auth_user_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_user
    ADD CONSTRAINT auth_user_pkey PRIMARY KEY (id);


--
-- Name: auth_user_user_permissions auth_user_user_permissions_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permissions_pkey PRIMARY KEY (id);


--
-- Name: auth_user_user_permissions auth_user_user_permissions_user_id_permission_id_14a6b632_uniq; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permissions_user_id_permission_id_14a6b632_uniq UNIQUE (user_id, permission_id);


--
-- Name: auth_user auth_user_username_key; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_user
    ADD CONSTRAINT auth_user_username_key UNIQUE (username);


--
-- Name: django_admin_log django_admin_log_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.django_admin_log
    ADD CONSTRAINT django_admin_log_pkey PRIMARY KEY (id);


--
-- Name: django_content_type django_content_type_app_label_model_76bd3d3b_uniq; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.django_content_type
    ADD CONSTRAINT django_content_type_app_label_model_76bd3d3b_uniq UNIQUE (app_label, model);


--
-- Name: django_content_type django_content_type_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.django_content_type
    ADD CONSTRAINT django_content_type_pkey PRIMARY KEY (id);


--
-- Name: django_migrations django_migrations_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.django_migrations
    ADD CONSTRAINT django_migrations_pkey PRIMARY KEY (id);


--
-- Name: django_session django_session_pkey; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.django_session
    ADD CONSTRAINT django_session_pkey PRIMARY KEY (session_key);


--
-- Name: ACCOUNT_DEFAULTS uq_account_defaults_sub; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_DEFAULTS"
    ADD CONSTRAINT uq_account_defaults_sub UNIQUE ("SUBSIDIARY_ID");


--
-- Name: ACCOUNT_FULL_RECONCILE_LINES uq_full_reconcile_line; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_FULL_RECONCILE_LINES"
    ADD CONSTRAINT uq_full_reconcile_line UNIQUE ("FULL_ID", "MOVE_LINE_ID");


--
-- Name: ACCOUNT_JOURNALS uq_journal_sub_code; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_JOURNALS"
    ADD CONSTRAINT uq_journal_sub_code UNIQUE ("SUBSIDIARY_ID", "CODE");


--
-- Name: ACCOUNT_MOVE_LINE_TAXES uq_line_tax; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVE_LINE_TAXES"
    ADD CONSTRAINT uq_line_tax UNIQUE ("LINE_ID", "TAX_ID");


--
-- Name: ACCOUNT_MOVES uq_move_journal_number; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVES"
    ADD CONSTRAINT uq_move_journal_number UNIQUE ("JOURNAL_ID", "MOVE_NUMBER");


--
-- Name: ACCOUNT_TAX_TAG_REL uq_tax_tag_rel; Type: CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAX_TAG_REL"
    ADD CONSTRAINT uq_tax_tag_rel UNIQUE ("TAX_ID", "TAG_ID");


--
-- Name: ACCOUNT_DEFAULTS_CASH_ACCOUNT_ID_f6227333; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_DEFAULTS_CASH_ACCOUNT_ID_f6227333" ON pos_loc."ACCOUNT_DEFAULTS" USING btree ("CASH_ACCOUNT_ID");


--
-- Name: ACCOUNT_DEFAULTS_DISCOUNT_ACCOUNT_ID_f75118af; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_DEFAULTS_DISCOUNT_ACCOUNT_ID_f75118af" ON pos_loc."ACCOUNT_DEFAULTS" USING btree ("DISCOUNT_ACCOUNT_ID");


--
-- Name: ACCOUNT_DEFAULTS_RECEIVABLE_ACCOUNT_ID_408a89ea; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_DEFAULTS_RECEIVABLE_ACCOUNT_ID_408a89ea" ON pos_loc."ACCOUNT_DEFAULTS" USING btree ("RECEIVABLE_ACCOUNT_ID");


--
-- Name: ACCOUNT_DEFAULTS_SALES_ACCOUNT_ID_9a38c6b0; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_DEFAULTS_SALES_ACCOUNT_ID_9a38c6b0" ON pos_loc."ACCOUNT_DEFAULTS" USING btree ("SALES_ACCOUNT_ID");


--
-- Name: ACCOUNT_DEFAULTS_SALES_JOURNAL_ID_67946698; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_DEFAULTS_SALES_JOURNAL_ID_67946698" ON pos_loc."ACCOUNT_DEFAULTS" USING btree ("SALES_JOURNAL_ID");


--
-- Name: ACCOUNT_DEFAULTS_SUBSIDIARY_ID_0d490d61; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_DEFAULTS_SUBSIDIARY_ID_0d490d61" ON pos_loc."ACCOUNT_DEFAULTS" USING btree ("SUBSIDIARY_ID");


--
-- Name: ACCOUNT_DEFAULTS_TAX_ACCOUNT_ID_c116c55b; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_DEFAULTS_TAX_ACCOUNT_ID_c116c55b" ON pos_loc."ACCOUNT_DEFAULTS" USING btree ("TAX_ACCOUNT_ID");


--
-- Name: ACCOUNT_FULL_RECONCILE_LINES_FULL_ID_9f163797; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_FULL_RECONCILE_LINES_FULL_ID_9f163797" ON pos_loc."ACCOUNT_FULL_RECONCILE_LINES" USING btree ("FULL_ID");


--
-- Name: ACCOUNT_FULL_RECONCILE_LINES_MOVE_LINE_ID_c4521648; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_FULL_RECONCILE_LINES_MOVE_LINE_ID_c4521648" ON pos_loc."ACCOUNT_FULL_RECONCILE_LINES" USING btree ("MOVE_LINE_ID");


--
-- Name: ACCOUNT_JOURNALS_SUBSIDIARY_ID_346bdc64; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_JOURNALS_SUBSIDIARY_ID_346bdc64" ON pos_loc."ACCOUNT_JOURNALS" USING btree ("SUBSIDIARY_ID");


--
-- Name: ACCOUNT_MOVES_CURRENCY_ID_8b6c644a; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_MOVES_CURRENCY_ID_8b6c644a" ON pos_loc."ACCOUNT_MOVES" USING btree ("CURRENCY_ID");


--
-- Name: ACCOUNT_MOVES_JOURNAL_ID_58b23dbb; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_MOVES_JOURNAL_ID_58b23dbb" ON pos_loc."ACCOUNT_MOVES" USING btree ("JOURNAL_ID");


--
-- Name: ACCOUNT_MOVES_PERIOD_ID_f79d4a08; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_MOVES_PERIOD_ID_f79d4a08" ON pos_loc."ACCOUNT_MOVES" USING btree ("PERIOD_ID");


--
-- Name: ACCOUNT_MOVES_SUBSIDIARY_ID_fc510a2c; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_MOVES_SUBSIDIARY_ID_fc510a2c" ON pos_loc."ACCOUNT_MOVES" USING btree ("SUBSIDIARY_ID");


--
-- Name: ACCOUNT_MOVES_TRANSACTION_ID_1740ff15; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_MOVES_TRANSACTION_ID_1740ff15" ON pos_loc."ACCOUNT_MOVES" USING btree ("TRANSACTION_ID");


--
-- Name: ACCOUNT_MOVE_LINES_ACCOUNT_ID_e475452d; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_MOVE_LINES_ACCOUNT_ID_e475452d" ON pos_loc."ACCOUNT_MOVE_LINES" USING btree ("ACCOUNT_ID");


--
-- Name: ACCOUNT_MOVE_LINES_CURRENCY_ID_c0f69d98; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_MOVE_LINES_CURRENCY_ID_c0f69d98" ON pos_loc."ACCOUNT_MOVE_LINES" USING btree ("CURRENCY_ID");


--
-- Name: ACCOUNT_MOVE_LINES_CUSTOMER_ID_015ace2c; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_MOVE_LINES_CUSTOMER_ID_015ace2c" ON pos_loc."ACCOUNT_MOVE_LINES" USING btree ("CUSTOMER_ID");


--
-- Name: ACCOUNT_MOVE_LINES_MOVE_ID_59a13974; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_MOVE_LINES_MOVE_ID_59a13974" ON pos_loc."ACCOUNT_MOVE_LINES" USING btree ("MOVE_ID");


--
-- Name: ACCOUNT_MOVE_LINE_TAXES_LINE_ID_005d151d; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_MOVE_LINE_TAXES_LINE_ID_005d151d" ON pos_loc."ACCOUNT_MOVE_LINE_TAXES" USING btree ("LINE_ID");


--
-- Name: ACCOUNT_MOVE_LINE_TAXES_TAX_ID_3ddee596; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_MOVE_LINE_TAXES_TAX_ID_3ddee596" ON pos_loc."ACCOUNT_MOVE_LINE_TAXES" USING btree ("TAX_ID");


--
-- Name: ACCOUNT_PARTIAL_RECONCILES_CREDIT_MOVE_LINE_ID_918f94f4; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_PARTIAL_RECONCILES_CREDIT_MOVE_LINE_ID_918f94f4" ON pos_loc."ACCOUNT_PARTIAL_RECONCILES" USING btree ("CREDIT_MOVE_LINE_ID");


--
-- Name: ACCOUNT_PARTIAL_RECONCILES_DEBIT_MOVE_LINE_ID_fdc90266; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_PARTIAL_RECONCILES_DEBIT_MOVE_LINE_ID_fdc90266" ON pos_loc."ACCOUNT_PARTIAL_RECONCILES" USING btree ("DEBIT_MOVE_LINE_ID");


--
-- Name: ACCOUNT_PAYMENTS_CURRENCY_ID_8aaef64a; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_PAYMENTS_CURRENCY_ID_8aaef64a" ON pos_loc."ACCOUNT_PAYMENTS" USING btree ("CURRENCY_ID");


--
-- Name: ACCOUNT_PAYMENTS_CUSTOMER_ID_3d190ea8; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_PAYMENTS_CUSTOMER_ID_3d190ea8" ON pos_loc."ACCOUNT_PAYMENTS" USING btree ("CUSTOMER_ID");


--
-- Name: ACCOUNT_PAYMENTS_JOURNAL_ID_1836e1ea; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_PAYMENTS_JOURNAL_ID_1836e1ea" ON pos_loc."ACCOUNT_PAYMENTS" USING btree ("JOURNAL_ID");


--
-- Name: ACCOUNT_PAYMENTS_MOVE_ID_eac528eb; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_PAYMENTS_MOVE_ID_eac528eb" ON pos_loc."ACCOUNT_PAYMENTS" USING btree ("MOVE_ID");


--
-- Name: ACCOUNT_PAYMENTS_SUBSIDIARY_ID_d92c339d; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_PAYMENTS_SUBSIDIARY_ID_d92c339d" ON pos_loc."ACCOUNT_PAYMENTS" USING btree ("SUBSIDIARY_ID");


--
-- Name: ACCOUNT_PAYMENTS_TRANSACTION_ID_fa6f5f86; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_PAYMENTS_TRANSACTION_ID_fa6f5f86" ON pos_loc."ACCOUNT_PAYMENTS" USING btree ("TRANSACTION_ID");


--
-- Name: ACCOUNT_TAXES_ACCOUNT_ID_5de5e847; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_TAXES_ACCOUNT_ID_5de5e847" ON pos_loc."ACCOUNT_TAXES" USING btree ("ACCOUNT_ID");


--
-- Name: ACCOUNT_TAXES_GROUP_ID_f02cfde8; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_TAXES_GROUP_ID_f02cfde8" ON pos_loc."ACCOUNT_TAXES" USING btree ("GROUP_ID");


--
-- Name: ACCOUNT_TAXES_SUBSIDIARY_ID_252050d2; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_TAXES_SUBSIDIARY_ID_252050d2" ON pos_loc."ACCOUNT_TAXES" USING btree ("SUBSIDIARY_ID");


--
-- Name: ACCOUNT_TAX_GROUPS_SUBSIDIARY_ID_b17cde0f; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_TAX_GROUPS_SUBSIDIARY_ID_b17cde0f" ON pos_loc."ACCOUNT_TAX_GROUPS" USING btree ("SUBSIDIARY_ID");


--
-- Name: ACCOUNT_TAX_TAGS_SUBSIDIARY_ID_5c3c0572; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_TAX_TAGS_SUBSIDIARY_ID_5c3c0572" ON pos_loc."ACCOUNT_TAX_TAGS" USING btree ("SUBSIDIARY_ID");


--
-- Name: ACCOUNT_TAX_TAG_REL_TAG_ID_7236b178; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_TAX_TAG_REL_TAG_ID_7236b178" ON pos_loc."ACCOUNT_TAX_TAG_REL" USING btree ("TAG_ID");


--
-- Name: ACCOUNT_TAX_TAG_REL_TAX_ID_03d3e392; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX "ACCOUNT_TAX_TAG_REL_TAX_ID_03d3e392" ON pos_loc."ACCOUNT_TAX_TAG_REL" USING btree ("TAX_ID");


--
-- Name: auth_group_name_a6ea08ec_like; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX auth_group_name_a6ea08ec_like ON pos_loc.auth_group USING btree (name varchar_pattern_ops);


--
-- Name: auth_group_permissions_group_id_b120cbf9; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX auth_group_permissions_group_id_b120cbf9 ON pos_loc.auth_group_permissions USING btree (group_id);


--
-- Name: auth_group_permissions_permission_id_84c5c92e; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX auth_group_permissions_permission_id_84c5c92e ON pos_loc.auth_group_permissions USING btree (permission_id);


--
-- Name: auth_permission_content_type_id_2f476e4b; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX auth_permission_content_type_id_2f476e4b ON pos_loc.auth_permission USING btree (content_type_id);


--
-- Name: auth_user_groups_group_id_97559544; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX auth_user_groups_group_id_97559544 ON pos_loc.auth_user_groups USING btree (group_id);


--
-- Name: auth_user_groups_user_id_6a12ed8b; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX auth_user_groups_user_id_6a12ed8b ON pos_loc.auth_user_groups USING btree (user_id);


--
-- Name: auth_user_user_permissions_permission_id_1fbb5f2c; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX auth_user_user_permissions_permission_id_1fbb5f2c ON pos_loc.auth_user_user_permissions USING btree (permission_id);


--
-- Name: auth_user_user_permissions_user_id_a95ead1b; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX auth_user_user_permissions_user_id_a95ead1b ON pos_loc.auth_user_user_permissions USING btree (user_id);


--
-- Name: auth_user_username_6821ab7c_like; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX auth_user_username_6821ab7c_like ON pos_loc.auth_user USING btree (username varchar_pattern_ops);


--
-- Name: django_admin_log_content_type_id_c4bce8eb; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX django_admin_log_content_type_id_c4bce8eb ON pos_loc.django_admin_log USING btree (content_type_id);


--
-- Name: django_admin_log_user_id_c564eba6; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX django_admin_log_user_id_c564eba6 ON pos_loc.django_admin_log USING btree (user_id);


--
-- Name: django_session_expire_date_a5c62663; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX django_session_expire_date_a5c62663 ON pos_loc.django_session USING btree (expire_date);


--
-- Name: django_session_session_key_c0390e0f_like; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX django_session_session_key_c0390e0f_like ON pos_loc.django_session USING btree (session_key varchar_pattern_ops);


--
-- Name: idx_inventory_lookup; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_inventory_lookup ON pos_loc."TRANSACTION_INVENTORY_DETAILS" USING btree ("LOCATION_ID", "ITEM_ID");


--
-- Name: idx_items_barcode; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_items_barcode ON pos_loc."ITEMS" USING btree ("SUBSIDIARY_ID", "BARCODE");


--
-- Name: idx_journal_sub_code; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_journal_sub_code ON pos_loc."ACCOUNT_JOURNALS" USING btree ("SUBSIDIARY_ID", "CODE");


--
-- Name: idx_journal_type; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_journal_type ON pos_loc."ACCOUNT_JOURNALS" USING btree ("JOURNAL_TYPE");


--
-- Name: idx_line_account_move; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_line_account_move ON pos_loc."ACCOUNT_MOVE_LINES" USING btree ("ACCOUNT_ID", "MOVE_ID");


--
-- Name: idx_line_customer; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_line_customer ON pos_loc."ACCOUNT_MOVE_LINES" USING btree ("CUSTOMER_ID");


--
-- Name: idx_line_maturity; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_line_maturity ON pos_loc."ACCOUNT_MOVE_LINES" USING btree ("MATURITY_DATE");


--
-- Name: idx_move_journal_date; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_move_journal_date ON pos_loc."ACCOUNT_MOVES" USING btree ("JOURNAL_ID", "MOVE_DATE");


--
-- Name: idx_move_state_date; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_move_state_date ON pos_loc."ACCOUNT_MOVES" USING btree ("STATE", "MOVE_DATE");


--
-- Name: idx_move_sub_date; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_move_sub_date ON pos_loc."ACCOUNT_MOVES" USING btree ("SUBSIDIARY_ID", "MOVE_DATE");


--
-- Name: idx_pay_journal_date; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_pay_journal_date ON pos_loc."ACCOUNT_PAYMENTS" USING btree ("JOURNAL_ID", "PAYMENT_DATE");


--
-- Name: idx_pay_state; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_pay_state ON pos_loc."ACCOUNT_PAYMENTS" USING btree ("STATE");


--
-- Name: idx_pay_sub_date; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_pay_sub_date ON pos_loc."ACCOUNT_PAYMENTS" USING btree ("SUBSIDIARY_ID", "PAYMENT_DATE");


--
-- Name: idx_tax_group_sub; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_tax_group_sub ON pos_loc."ACCOUNT_TAX_GROUPS" USING btree ("SUBSIDIARY_ID", "CODE");


--
-- Name: idx_tax_sub_type; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_tax_sub_type ON pos_loc."ACCOUNT_TAXES" USING btree ("SUBSIDIARY_ID", "TAX_TYPE");


--
-- Name: idx_trx_customer; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_trx_customer ON pos_loc."TRANSACTIONS" USING btree ("CUSTOMER_ID");


--
-- Name: idx_trx_date; Type: INDEX; Schema: pos_loc; Owner: -
--

CREATE INDEX idx_trx_date ON pos_loc."TRANSACTIONS" USING btree ("SUBSIDIARY_ID", "TRX_DATE");


--
-- Name: TRANSACTION_LINES trg_sale_deduct_inventory; Type: TRIGGER; Schema: pos_loc; Owner: -
--

CREATE TRIGGER trg_sale_deduct_inventory AFTER INSERT ON pos_loc."TRANSACTION_LINES" FOR EACH ROW EXECUTE FUNCTION pos_loc.fn_deduct_inventory();


--
-- Name: ACCOUNTS ACCOUNTS_SUBSIDIARY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNTS"
    ADD CONSTRAINT "ACCOUNTS_SUBSIDIARY_ID_fkey" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID");


--
-- Name: ACCOUNT_DEFAULTS ACCOUNT_DEFAULTS_CASH_ACCOUNT_ID_f6227333_fk_ACCOUNTS_; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_DEFAULTS"
    ADD CONSTRAINT "ACCOUNT_DEFAULTS_CASH_ACCOUNT_ID_f6227333_fk_ACCOUNTS_" FOREIGN KEY ("CASH_ACCOUNT_ID") REFERENCES pos_loc."ACCOUNTS"("ACCOUNT_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_DEFAULTS ACCOUNT_DEFAULTS_DISCOUNT_ACCOUNT_ID_f75118af_fk_ACCOUNTS_; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_DEFAULTS"
    ADD CONSTRAINT "ACCOUNT_DEFAULTS_DISCOUNT_ACCOUNT_ID_f75118af_fk_ACCOUNTS_" FOREIGN KEY ("DISCOUNT_ACCOUNT_ID") REFERENCES pos_loc."ACCOUNTS"("ACCOUNT_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_DEFAULTS ACCOUNT_DEFAULTS_RECEIVABLE_ACCOUNT_I_408a89ea_fk_ACCOUNTS_; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_DEFAULTS"
    ADD CONSTRAINT "ACCOUNT_DEFAULTS_RECEIVABLE_ACCOUNT_I_408a89ea_fk_ACCOUNTS_" FOREIGN KEY ("RECEIVABLE_ACCOUNT_ID") REFERENCES pos_loc."ACCOUNTS"("ACCOUNT_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_DEFAULTS ACCOUNT_DEFAULTS_SALES_ACCOUNT_ID_9a38c6b0_fk_ACCOUNTS_; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_DEFAULTS"
    ADD CONSTRAINT "ACCOUNT_DEFAULTS_SALES_ACCOUNT_ID_9a38c6b0_fk_ACCOUNTS_" FOREIGN KEY ("SALES_ACCOUNT_ID") REFERENCES pos_loc."ACCOUNTS"("ACCOUNT_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_DEFAULTS ACCOUNT_DEFAULTS_SALES_JOURNAL_ID_67946698_fk_ACCOUNT_J; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_DEFAULTS"
    ADD CONSTRAINT "ACCOUNT_DEFAULTS_SALES_JOURNAL_ID_67946698_fk_ACCOUNT_J" FOREIGN KEY ("SALES_JOURNAL_ID") REFERENCES pos_loc."ACCOUNT_JOURNALS"("JOURNAL_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_DEFAULTS ACCOUNT_DEFAULTS_SUBSIDIARY_ID_0d490d61_fk_SUBSIDIAR; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_DEFAULTS"
    ADD CONSTRAINT "ACCOUNT_DEFAULTS_SUBSIDIARY_ID_0d490d61_fk_SUBSIDIAR" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_DEFAULTS ACCOUNT_DEFAULTS_TAX_ACCOUNT_ID_c116c55b_fk_ACCOUNTS_ACCOUNT_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_DEFAULTS"
    ADD CONSTRAINT "ACCOUNT_DEFAULTS_TAX_ACCOUNT_ID_c116c55b_fk_ACCOUNTS_ACCOUNT_ID" FOREIGN KEY ("TAX_ACCOUNT_ID") REFERENCES pos_loc."ACCOUNTS"("ACCOUNT_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_FULL_RECONCILE_LINES ACCOUNT_FULL_RECONCI_FULL_ID_9f163797_fk_ACCOUNT_F; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_FULL_RECONCILE_LINES"
    ADD CONSTRAINT "ACCOUNT_FULL_RECONCI_FULL_ID_9f163797_fk_ACCOUNT_F" FOREIGN KEY ("FULL_ID") REFERENCES pos_loc."ACCOUNT_FULL_RECONCILES"("FULL_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_FULL_RECONCILE_LINES ACCOUNT_FULL_RECONCI_MOVE_LINE_ID_c4521648_fk_ACCOUNT_M; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_FULL_RECONCILE_LINES"
    ADD CONSTRAINT "ACCOUNT_FULL_RECONCI_MOVE_LINE_ID_c4521648_fk_ACCOUNT_M" FOREIGN KEY ("MOVE_LINE_ID") REFERENCES pos_loc."ACCOUNT_MOVE_LINES"("LINE_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_JOURNALS ACCOUNT_JOURNALS_SUBSIDIARY_ID_346bdc64_fk_SUBSIDIAR; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_JOURNALS"
    ADD CONSTRAINT "ACCOUNT_JOURNALS_SUBSIDIARY_ID_346bdc64_fk_SUBSIDIAR" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_MOVES ACCOUNT_MOVES_CURRENCY_ID_8b6c644a_fk_CURRENCIES_CURRENCY_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVES"
    ADD CONSTRAINT "ACCOUNT_MOVES_CURRENCY_ID_8b6c644a_fk_CURRENCIES_CURRENCY_ID" FOREIGN KEY ("CURRENCY_ID") REFERENCES pos_loc."CURRENCIES"("CURRENCY_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_MOVES ACCOUNT_MOVES_JOURNAL_ID_58b23dbb_fk_ACCOUNT_J; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVES"
    ADD CONSTRAINT "ACCOUNT_MOVES_JOURNAL_ID_58b23dbb_fk_ACCOUNT_J" FOREIGN KEY ("JOURNAL_ID") REFERENCES pos_loc."ACCOUNT_JOURNALS"("JOURNAL_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_MOVES ACCOUNT_MOVES_PERIOD_ID_f79d4a08_fk_ACCOUNTIN; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVES"
    ADD CONSTRAINT "ACCOUNT_MOVES_PERIOD_ID_f79d4a08_fk_ACCOUNTIN" FOREIGN KEY ("PERIOD_ID") REFERENCES pos_loc."ACCOUNTING_PERIODS"("PERIOD_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_MOVES ACCOUNT_MOVES_SUBSIDIARY_ID_fc510a2c_fk_SUBSIDIAR; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVES"
    ADD CONSTRAINT "ACCOUNT_MOVES_SUBSIDIARY_ID_fc510a2c_fk_SUBSIDIAR" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_MOVES ACCOUNT_MOVES_TRANSACTION_ID_1740ff15_fk_TRANSACTI; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVES"
    ADD CONSTRAINT "ACCOUNT_MOVES_TRANSACTION_ID_1740ff15_fk_TRANSACTI" FOREIGN KEY ("TRANSACTION_ID") REFERENCES pos_loc."TRANSACTIONS"("TRANSACTION_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_MOVE_LINES ACCOUNT_MOVE_LINES_ACCOUNT_ID_e475452d_fk_ACCOUNTS_ACCOUNT_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVE_LINES"
    ADD CONSTRAINT "ACCOUNT_MOVE_LINES_ACCOUNT_ID_e475452d_fk_ACCOUNTS_ACCOUNT_ID" FOREIGN KEY ("ACCOUNT_ID") REFERENCES pos_loc."ACCOUNTS"("ACCOUNT_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_MOVE_LINES ACCOUNT_MOVE_LINES_CURRENCY_ID_c0f69d98_fk_CURRENCIE; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVE_LINES"
    ADD CONSTRAINT "ACCOUNT_MOVE_LINES_CURRENCY_ID_c0f69d98_fk_CURRENCIE" FOREIGN KEY ("CURRENCY_ID") REFERENCES pos_loc."CURRENCIES"("CURRENCY_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_MOVE_LINES ACCOUNT_MOVE_LINES_CUSTOMER_ID_015ace2c_fk_CUSTOMERS; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVE_LINES"
    ADD CONSTRAINT "ACCOUNT_MOVE_LINES_CUSTOMER_ID_015ace2c_fk_CUSTOMERS" FOREIGN KEY ("CUSTOMER_ID") REFERENCES pos_loc."CUSTOMERS"("CUSTOMER_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_MOVE_LINES ACCOUNT_MOVE_LINES_MOVE_ID_59a13974_fk_ACCOUNT_MOVES_MOVE_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVE_LINES"
    ADD CONSTRAINT "ACCOUNT_MOVE_LINES_MOVE_ID_59a13974_fk_ACCOUNT_MOVES_MOVE_ID" FOREIGN KEY ("MOVE_ID") REFERENCES pos_loc."ACCOUNT_MOVES"("MOVE_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_MOVE_LINE_TAXES ACCOUNT_MOVE_LINE_TAXES_TAX_ID_3ddee596_fk_ACCOUNT_TAXES_TAX_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVE_LINE_TAXES"
    ADD CONSTRAINT "ACCOUNT_MOVE_LINE_TAXES_TAX_ID_3ddee596_fk_ACCOUNT_TAXES_TAX_ID" FOREIGN KEY ("TAX_ID") REFERENCES pos_loc."ACCOUNT_TAXES"("TAX_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_MOVE_LINE_TAXES ACCOUNT_MOVE_LINE_TA_LINE_ID_005d151d_fk_ACCOUNT_M; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_MOVE_LINE_TAXES"
    ADD CONSTRAINT "ACCOUNT_MOVE_LINE_TA_LINE_ID_005d151d_fk_ACCOUNT_M" FOREIGN KEY ("LINE_ID") REFERENCES pos_loc."ACCOUNT_MOVE_LINES"("LINE_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_PARTIAL_RECONCILES ACCOUNT_PARTIAL_RECO_CREDIT_MOVE_LINE_ID_918f94f4_fk_ACCOUNT_M; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_PARTIAL_RECONCILES"
    ADD CONSTRAINT "ACCOUNT_PARTIAL_RECO_CREDIT_MOVE_LINE_ID_918f94f4_fk_ACCOUNT_M" FOREIGN KEY ("CREDIT_MOVE_LINE_ID") REFERENCES pos_loc."ACCOUNT_MOVE_LINES"("LINE_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_PARTIAL_RECONCILES ACCOUNT_PARTIAL_RECO_DEBIT_MOVE_LINE_ID_fdc90266_fk_ACCOUNT_M; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_PARTIAL_RECONCILES"
    ADD CONSTRAINT "ACCOUNT_PARTIAL_RECO_DEBIT_MOVE_LINE_ID_fdc90266_fk_ACCOUNT_M" FOREIGN KEY ("DEBIT_MOVE_LINE_ID") REFERENCES pos_loc."ACCOUNT_MOVE_LINES"("LINE_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_PAYMENTS ACCOUNT_PAYMENTS_CURRENCY_ID_8aaef64a_fk_CURRENCIES_CURRENCY_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_PAYMENTS"
    ADD CONSTRAINT "ACCOUNT_PAYMENTS_CURRENCY_ID_8aaef64a_fk_CURRENCIES_CURRENCY_ID" FOREIGN KEY ("CURRENCY_ID") REFERENCES pos_loc."CURRENCIES"("CURRENCY_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_PAYMENTS ACCOUNT_PAYMENTS_CUSTOMER_ID_3d190ea8_fk_CUSTOMERS_CUSTOMER_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_PAYMENTS"
    ADD CONSTRAINT "ACCOUNT_PAYMENTS_CUSTOMER_ID_3d190ea8_fk_CUSTOMERS_CUSTOMER_ID" FOREIGN KEY ("CUSTOMER_ID") REFERENCES pos_loc."CUSTOMERS"("CUSTOMER_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_PAYMENTS ACCOUNT_PAYMENTS_JOURNAL_ID_1836e1ea_fk_ACCOUNT_J; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_PAYMENTS"
    ADD CONSTRAINT "ACCOUNT_PAYMENTS_JOURNAL_ID_1836e1ea_fk_ACCOUNT_J" FOREIGN KEY ("JOURNAL_ID") REFERENCES pos_loc."ACCOUNT_JOURNALS"("JOURNAL_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_PAYMENTS ACCOUNT_PAYMENTS_MOVE_ID_eac528eb_fk_ACCOUNT_MOVES_MOVE_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_PAYMENTS"
    ADD CONSTRAINT "ACCOUNT_PAYMENTS_MOVE_ID_eac528eb_fk_ACCOUNT_MOVES_MOVE_ID" FOREIGN KEY ("MOVE_ID") REFERENCES pos_loc."ACCOUNT_MOVES"("MOVE_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_PAYMENTS ACCOUNT_PAYMENTS_SUBSIDIARY_ID_d92c339d_fk_SUBSIDIAR; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_PAYMENTS"
    ADD CONSTRAINT "ACCOUNT_PAYMENTS_SUBSIDIARY_ID_d92c339d_fk_SUBSIDIAR" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_PAYMENTS ACCOUNT_PAYMENTS_TRANSACTION_ID_fa6f5f86_fk_TRANSACTI; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_PAYMENTS"
    ADD CONSTRAINT "ACCOUNT_PAYMENTS_TRANSACTION_ID_fa6f5f86_fk_TRANSACTI" FOREIGN KEY ("TRANSACTION_ID") REFERENCES pos_loc."TRANSACTIONS"("TRANSACTION_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_TAXES ACCOUNT_TAXES_ACCOUNT_ID_5de5e847_fk_ACCOUNTS_ACCOUNT_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAXES"
    ADD CONSTRAINT "ACCOUNT_TAXES_ACCOUNT_ID_5de5e847_fk_ACCOUNTS_ACCOUNT_ID" FOREIGN KEY ("ACCOUNT_ID") REFERENCES pos_loc."ACCOUNTS"("ACCOUNT_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_TAXES ACCOUNT_TAXES_GROUP_ID_f02cfde8_fk_ACCOUNT_TAX_GROUPS_GROUP_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAXES"
    ADD CONSTRAINT "ACCOUNT_TAXES_GROUP_ID_f02cfde8_fk_ACCOUNT_TAX_GROUPS_GROUP_ID" FOREIGN KEY ("GROUP_ID") REFERENCES pos_loc."ACCOUNT_TAX_GROUPS"("GROUP_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_TAXES ACCOUNT_TAXES_SUBSIDIARY_ID_252050d2_fk_SUBSIDIAR; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAXES"
    ADD CONSTRAINT "ACCOUNT_TAXES_SUBSIDIARY_ID_252050d2_fk_SUBSIDIAR" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_TAX_GROUPS ACCOUNT_TAX_GROUPS_SUBSIDIARY_ID_b17cde0f_fk_SUBSIDIAR; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAX_GROUPS"
    ADD CONSTRAINT "ACCOUNT_TAX_GROUPS_SUBSIDIARY_ID_b17cde0f_fk_SUBSIDIAR" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_TAX_TAGS ACCOUNT_TAX_TAGS_SUBSIDIARY_ID_5c3c0572_fk_SUBSIDIAR; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAX_TAGS"
    ADD CONSTRAINT "ACCOUNT_TAX_TAGS_SUBSIDIARY_ID_5c3c0572_fk_SUBSIDIAR" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_TAX_TAG_REL ACCOUNT_TAX_TAG_REL_TAG_ID_7236b178_fk_ACCOUNT_TAX_TAGS_TAG_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAX_TAG_REL"
    ADD CONSTRAINT "ACCOUNT_TAX_TAG_REL_TAG_ID_7236b178_fk_ACCOUNT_TAX_TAGS_TAG_ID" FOREIGN KEY ("TAG_ID") REFERENCES pos_loc."ACCOUNT_TAX_TAGS"("TAG_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ACCOUNT_TAX_TAG_REL ACCOUNT_TAX_TAG_REL_TAX_ID_03d3e392_fk_ACCOUNT_TAXES_TAX_ID; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ACCOUNT_TAX_TAG_REL"
    ADD CONSTRAINT "ACCOUNT_TAX_TAG_REL_TAX_ID_03d3e392_fk_ACCOUNT_TAXES_TAX_ID" FOREIGN KEY ("TAX_ID") REFERENCES pos_loc."ACCOUNT_TAXES"("TAX_ID") DEFERRABLE INITIALLY DEFERRED;


--
-- Name: BINS BINS_LOCATION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."BINS"
    ADD CONSTRAINT "BINS_LOCATION_ID_fkey" FOREIGN KEY ("LOCATION_ID") REFERENCES pos_loc."LOCATIONS"("LOCATION_ID");


--
-- Name: BRANCH_STATIONS BRANCH_STATIONS_LOCATION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."BRANCH_STATIONS"
    ADD CONSTRAINT "BRANCH_STATIONS_LOCATION_ID_fkey" FOREIGN KEY ("LOCATION_ID") REFERENCES pos_loc."LOCATIONS"("LOCATION_ID");


--
-- Name: COMMISSION_RATE COMMISSION_RATE_PLAN_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."COMMISSION_RATE"
    ADD CONSTRAINT "COMMISSION_RATE_PLAN_ID_fkey" FOREIGN KEY ("PLAN_ID") REFERENCES pos_loc."COMMISSION_PLAN"("PLAN_ID");


--
-- Name: CURRENCY_RATES CURRENCY_RATES_CURRENCY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."CURRENCY_RATES"
    ADD CONSTRAINT "CURRENCY_RATES_CURRENCY_ID_fkey" FOREIGN KEY ("CURRENCY_ID") REFERENCES pos_loc."CURRENCIES"("CURRENCY_ID");


--
-- Name: CUSTOMERS CUSTOMERS_SUBSIDIARY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."CUSTOMERS"
    ADD CONSTRAINT "CUSTOMERS_SUBSIDIARY_ID_fkey" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID");


--
-- Name: DISCOUNTS DISCOUNTS_POLICY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."DISCOUNTS"
    ADD CONSTRAINT "DISCOUNTS_POLICY_ID_fkey" FOREIGN KEY ("POLICY_ID") REFERENCES pos_loc."DISCOUNT_POLICIES"("POLICY_ID");


--
-- Name: DISCOUNT_POLICIES DISCOUNT_POLICIES_SUBSIDIARY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."DISCOUNT_POLICIES"
    ADD CONSTRAINT "DISCOUNT_POLICIES_SUBSIDIARY_ID_fkey" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID");


--
-- Name: FND_LOVS_VALUES FND_LOVS_VALUES_LOV_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."FND_LOVS_VALUES"
    ADD CONSTRAINT "FND_LOVS_VALUES_LOV_ID_fkey" FOREIGN KEY ("LOV_ID") REFERENCES pos_loc."FND_LOVS"("LOV_ID");


--
-- Name: FND_ROLES FND_ROLES_SUBSIDIARY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."FND_ROLES"
    ADD CONSTRAINT "FND_ROLES_SUBSIDIARY_ID_fkey" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID");


--
-- Name: FND_USERS FND_USERS_ROLE_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."FND_USERS"
    ADD CONSTRAINT "FND_USERS_ROLE_ID_fkey" FOREIGN KEY ("ROLE_ID") REFERENCES pos_loc."FND_ROLES"("ROLE_ID");


--
-- Name: FND_USERS FND_USERS_SUBSIDIARY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."FND_USERS"
    ADD CONSTRAINT "FND_USERS_SUBSIDIARY_ID_fkey" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID");


--
-- Name: ITEMS ITEMS_CATEGORY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ITEMS"
    ADD CONSTRAINT "ITEMS_CATEGORY_ID_fkey" FOREIGN KEY ("CATEGORY_ID") REFERENCES pos_loc."ITEM_CATEGORY"("CATEGORY_ID");


--
-- Name: ITEMS ITEMS_SUBSIDIARY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ITEMS"
    ADD CONSTRAINT "ITEMS_SUBSIDIARY_ID_fkey" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID");


--
-- Name: ITEMS ITEMS_UOM_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ITEMS"
    ADD CONSTRAINT "ITEMS_UOM_ID_fkey" FOREIGN KEY ("UOM_ID") REFERENCES pos_loc."UOM"("UOM_ID");


--
-- Name: ITEM_CATEGORY ITEM_CATEGORY_PARENT_CATEGORY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ITEM_CATEGORY"
    ADD CONSTRAINT "ITEM_CATEGORY_PARENT_CATEGORY_ID_fkey" FOREIGN KEY ("PARENT_CATEGORY_ID") REFERENCES pos_loc."ITEM_CATEGORY"("CATEGORY_ID");


--
-- Name: ITEM_CATEGORY ITEM_CATEGORY_SUBSIDIARY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ITEM_CATEGORY"
    ADD CONSTRAINT "ITEM_CATEGORY_SUBSIDIARY_ID_fkey" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID");


--
-- Name: ITEM_PRICE_LIST ITEM_PRICE_LIST_ITEM_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ITEM_PRICE_LIST"
    ADD CONSTRAINT "ITEM_PRICE_LIST_ITEM_ID_fkey" FOREIGN KEY ("ITEM_ID") REFERENCES pos_loc."ITEMS"("ITEM_ID");


--
-- Name: ITEM_PRICE_LIST ITEM_PRICE_LIST_LOCATION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ITEM_PRICE_LIST"
    ADD CONSTRAINT "ITEM_PRICE_LIST_LOCATION_ID_fkey" FOREIGN KEY ("LOCATION_ID") REFERENCES pos_loc."LOCATIONS"("LOCATION_ID");


--
-- Name: LOCATIONS LOCATIONS_SUBSIDIARY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."LOCATIONS"
    ADD CONSTRAINT "LOCATIONS_SUBSIDIARY_ID_fkey" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID") ON DELETE CASCADE;


--
-- Name: REWARD_POINTS REWARD_POINTS_CUSTOMER_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."REWARD_POINTS"
    ADD CONSTRAINT "REWARD_POINTS_CUSTOMER_ID_fkey" FOREIGN KEY ("CUSTOMER_ID") REFERENCES pos_loc."CUSTOMERS"("CUSTOMER_ID");


--
-- Name: TAX_ITEMS TAX_ITEMS_TAX_TYPE_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TAX_ITEMS"
    ADD CONSTRAINT "TAX_ITEMS_TAX_TYPE_ID_fkey" FOREIGN KEY ("TAX_TYPE_ID") REFERENCES pos_loc."TAX_TYPES"("TAX_TYPE_ID");


--
-- Name: TAX_SA_SETTINGS TAX_SA_SETTINGS_SUBSIDIARY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TAX_SA_SETTINGS"
    ADD CONSTRAINT "TAX_SA_SETTINGS_SUBSIDIARY_ID_fkey" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID");


--
-- Name: TIME_ATTENDANCE_REGISTER TIME_ATTENDANCE_REGISTER_LOCATION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TIME_ATTENDANCE_REGISTER"
    ADD CONSTRAINT "TIME_ATTENDANCE_REGISTER_LOCATION_ID_fkey" FOREIGN KEY ("LOCATION_ID") REFERENCES pos_loc."LOCATIONS"("LOCATION_ID");


--
-- Name: TIME_ATTENDANCE_REGISTER TIME_ATTENDANCE_REGISTER_USER_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TIME_ATTENDANCE_REGISTER"
    ADD CONSTRAINT "TIME_ATTENDANCE_REGISTER_USER_ID_fkey" FOREIGN KEY ("USER_ID") REFERENCES pos_loc."FND_USERS"("USER_ID");


--
-- Name: TRANSACTIONS TRANSACTIONS_CUSTOMER_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTIONS"
    ADD CONSTRAINT "TRANSACTIONS_CUSTOMER_ID_fkey" FOREIGN KEY ("CUSTOMER_ID") REFERENCES pos_loc."CUSTOMERS"("CUSTOMER_ID");


--
-- Name: TRANSACTIONS TRANSACTIONS_LOCATION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTIONS"
    ADD CONSTRAINT "TRANSACTIONS_LOCATION_ID_fkey" FOREIGN KEY ("LOCATION_ID") REFERENCES pos_loc."LOCATIONS"("LOCATION_ID");


--
-- Name: TRANSACTIONS TRANSACTIONS_STATION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTIONS"
    ADD CONSTRAINT "TRANSACTIONS_STATION_ID_fkey" FOREIGN KEY ("STATION_ID") REFERENCES pos_loc."BRANCH_STATIONS"("STATION_ID");


--
-- Name: TRANSACTIONS TRANSACTIONS_STATUS_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTIONS"
    ADD CONSTRAINT "TRANSACTIONS_STATUS_ID_fkey" FOREIGN KEY ("STATUS_ID") REFERENCES pos_loc."TRANSACTION_STATUS"("STATUS_ID");


--
-- Name: TRANSACTIONS TRANSACTIONS_SUBSIDIARY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTIONS"
    ADD CONSTRAINT "TRANSACTIONS_SUBSIDIARY_ID_fkey" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID");


--
-- Name: TRANSACTIONS TRANSACTIONS_USER_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTIONS"
    ADD CONSTRAINT "TRANSACTIONS_USER_ID_fkey" FOREIGN KEY ("USER_ID") REFERENCES pos_loc."FND_USERS"("USER_ID");


--
-- Name: TRANSACTION_ACCOUNTING_LINES TRANSACTION_ACCOUNTING_LINES_ACCOUNT_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_ACCOUNTING_LINES"
    ADD CONSTRAINT "TRANSACTION_ACCOUNTING_LINES_ACCOUNT_ID_fkey" FOREIGN KEY ("ACCOUNT_ID") REFERENCES pos_loc."ACCOUNTS"("ACCOUNT_ID");


--
-- Name: TRANSACTION_ACCOUNTING_LINES TRANSACTION_ACCOUNTING_LINES_TRANSACTION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_ACCOUNTING_LINES"
    ADD CONSTRAINT "TRANSACTION_ACCOUNTING_LINES_TRANSACTION_ID_fkey" FOREIGN KEY ("TRANSACTION_ID") REFERENCES pos_loc."TRANSACTIONS"("TRANSACTION_ID");


--
-- Name: TRANSACTION_COMMENTS TRANSACTION_COMMENTS_CREATED_BY_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_COMMENTS"
    ADD CONSTRAINT "TRANSACTION_COMMENTS_CREATED_BY_fkey" FOREIGN KEY ("CREATED_BY") REFERENCES pos_loc."FND_USERS"("USER_ID");


--
-- Name: TRANSACTION_COMMENTS TRANSACTION_COMMENTS_TRANSACTION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_COMMENTS"
    ADD CONSTRAINT "TRANSACTION_COMMENTS_TRANSACTION_ID_fkey" FOREIGN KEY ("TRANSACTION_ID") REFERENCES pos_loc."TRANSACTIONS"("TRANSACTION_ID");


--
-- Name: TRANSACTION_INVENTORY_BATCH TRANSACTION_INVENTORY_BATCH_ITEM_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_INVENTORY_BATCH"
    ADD CONSTRAINT "TRANSACTION_INVENTORY_BATCH_ITEM_ID_fkey" FOREIGN KEY ("ITEM_ID") REFERENCES pos_loc."ITEMS"("ITEM_ID");


--
-- Name: TRANSACTION_INVENTORY_BATCH TRANSACTION_INVENTORY_BATCH_LOCATION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_INVENTORY_BATCH"
    ADD CONSTRAINT "TRANSACTION_INVENTORY_BATCH_LOCATION_ID_fkey" FOREIGN KEY ("LOCATION_ID") REFERENCES pos_loc."LOCATIONS"("LOCATION_ID");


--
-- Name: TRANSACTION_INVENTORY_DETAILS TRANSACTION_INVENTORY_DETAILS_ITEM_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_INVENTORY_DETAILS"
    ADD CONSTRAINT "TRANSACTION_INVENTORY_DETAILS_ITEM_ID_fkey" FOREIGN KEY ("ITEM_ID") REFERENCES pos_loc."ITEMS"("ITEM_ID");


--
-- Name: TRANSACTION_INVENTORY_DETAILS TRANSACTION_INVENTORY_DETAILS_LOCATION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_INVENTORY_DETAILS"
    ADD CONSTRAINT "TRANSACTION_INVENTORY_DETAILS_LOCATION_ID_fkey" FOREIGN KEY ("LOCATION_ID") REFERENCES pos_loc."LOCATIONS"("LOCATION_ID");


--
-- Name: TRANSACTION_LINES TRANSACTION_LINES_ITEM_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_LINES"
    ADD CONSTRAINT "TRANSACTION_LINES_ITEM_ID_fkey" FOREIGN KEY ("ITEM_ID") REFERENCES pos_loc."ITEMS"("ITEM_ID");


--
-- Name: TRANSACTION_LINES TRANSACTION_LINES_TRANSACTION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_LINES"
    ADD CONSTRAINT "TRANSACTION_LINES_TRANSACTION_ID_fkey" FOREIGN KEY ("TRANSACTION_ID") REFERENCES pos_loc."TRANSACTIONS"("TRANSACTION_ID") ON DELETE CASCADE;


--
-- Name: TRANSACTION_LINES TRANSACTION_LINES_UOM_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_LINES"
    ADD CONSTRAINT "TRANSACTION_LINES_UOM_ID_fkey" FOREIGN KEY ("UOM_ID") REFERENCES pos_loc."UOM"("UOM_ID");


--
-- Name: TRANSACTION_TAX_DETAILS TRANSACTION_TAX_DETAILS_TAX_TYPE_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_TAX_DETAILS"
    ADD CONSTRAINT "TRANSACTION_TAX_DETAILS_TAX_TYPE_ID_fkey" FOREIGN KEY ("TAX_TYPE_ID") REFERENCES pos_loc."TAX_TYPES"("TAX_TYPE_ID");


--
-- Name: TRANSACTION_TAX_DETAILS TRANSACTION_TAX_DETAILS_TRANSACTION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."TRANSACTION_TAX_DETAILS"
    ADD CONSTRAINT "TRANSACTION_TAX_DETAILS_TRANSACTION_ID_fkey" FOREIGN KEY ("TRANSACTION_ID") REFERENCES pos_loc."TRANSACTIONS"("TRANSACTION_ID");


--
-- Name: XX_ITEM_SERIAL_NUMBER XX_ITEM_SERIAL_NUMBER_ITEM_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."XX_ITEM_SERIAL_NUMBER"
    ADD CONSTRAINT "XX_ITEM_SERIAL_NUMBER_ITEM_ID_fkey" FOREIGN KEY ("ITEM_ID") REFERENCES pos_loc."ITEMS"("ITEM_ID");


--
-- Name: ZATCA_ONBOARDING ZATCA_ONBOARDING_LOCATION_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ZATCA_ONBOARDING"
    ADD CONSTRAINT "ZATCA_ONBOARDING_LOCATION_ID_fkey" FOREIGN KEY ("LOCATION_ID") REFERENCES pos_loc."LOCATIONS"("LOCATION_ID");


--
-- Name: ZATCA_ONBOARDING ZATCA_ONBOARDING_SUBSIDIARY_ID_fkey; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc."ZATCA_ONBOARDING"
    ADD CONSTRAINT "ZATCA_ONBOARDING_SUBSIDIARY_ID_fkey" FOREIGN KEY ("SUBSIDIARY_ID") REFERENCES pos_loc."SUBSIDIARIES"("SUBSIDIARY_ID");


--
-- Name: auth_group_permissions auth_group_permissio_permission_id_84c5c92e_fk_auth_perm; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_group_permissions
    ADD CONSTRAINT auth_group_permissio_permission_id_84c5c92e_fk_auth_perm FOREIGN KEY (permission_id) REFERENCES pos_loc.auth_permission(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_group_permissions auth_group_permissions_group_id_b120cbf9_fk_auth_group_id; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_group_permissions
    ADD CONSTRAINT auth_group_permissions_group_id_b120cbf9_fk_auth_group_id FOREIGN KEY (group_id) REFERENCES pos_loc.auth_group(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_permission auth_permission_content_type_id_2f476e4b_fk_django_co; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_permission
    ADD CONSTRAINT auth_permission_content_type_id_2f476e4b_fk_django_co FOREIGN KEY (content_type_id) REFERENCES pos_loc.django_content_type(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_groups auth_user_groups_group_id_97559544_fk_auth_group_id; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_user_groups
    ADD CONSTRAINT auth_user_groups_group_id_97559544_fk_auth_group_id FOREIGN KEY (group_id) REFERENCES pos_loc.auth_group(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_groups auth_user_groups_user_id_6a12ed8b_fk_auth_user_id; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_user_groups
    ADD CONSTRAINT auth_user_groups_user_id_6a12ed8b_fk_auth_user_id FOREIGN KEY (user_id) REFERENCES pos_loc.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_user_permissions auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permi_permission_id_1fbb5f2c_fk_auth_perm FOREIGN KEY (permission_id) REFERENCES pos_loc.auth_permission(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: auth_user_user_permissions auth_user_user_permissions_user_id_a95ead1b_fk_auth_user_id; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.auth_user_user_permissions
    ADD CONSTRAINT auth_user_user_permissions_user_id_a95ead1b_fk_auth_user_id FOREIGN KEY (user_id) REFERENCES pos_loc.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: django_admin_log django_admin_log_content_type_id_c4bce8eb_fk_django_co; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.django_admin_log
    ADD CONSTRAINT django_admin_log_content_type_id_c4bce8eb_fk_django_co FOREIGN KEY (content_type_id) REFERENCES pos_loc.django_content_type(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: django_admin_log django_admin_log_user_id_c564eba6_fk_auth_user_id; Type: FK CONSTRAINT; Schema: pos_loc; Owner: -
--

ALTER TABLE ONLY pos_loc.django_admin_log
    ADD CONSTRAINT django_admin_log_user_id_c564eba6_fk_auth_user_id FOREIGN KEY (user_id) REFERENCES pos_loc.auth_user(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: ITEMS; Type: ROW SECURITY; Schema: pos_loc; Owner: -
--

ALTER TABLE pos_loc."ITEMS" ENABLE ROW LEVEL SECURITY;

--
-- Name: TRANSACTIONS; Type: ROW SECURITY; Schema: pos_loc; Owner: -
--

ALTER TABLE pos_loc."TRANSACTIONS" ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict xzA5hzedY6YJCiQs3BjmWevWmMF5S9llVZYi51pSxcyxytNenT2cy2yk0AD58ps
