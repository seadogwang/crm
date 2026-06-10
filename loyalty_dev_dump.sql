--
-- PostgreSQL database dump
--

\restrict Kt8UIDbwxcPipCVJLg367YObgLDkPvBbODR3YfVRrEBqgg5IbmTT9b2QfdTeoEn

-- Dumped from database version 16.11
-- Dumped by pg_dump version 16.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP POLICY IF EXISTS tenant_isolation_transaction_event ON public.transaction_event;
DROP POLICY IF EXISTS tenant_isolation_tier_change_log ON public.tier_change_log;
DROP POLICY IF EXISTS tenant_isolation_rule_snapshot ON public.rule_snapshot;
DROP POLICY IF EXISTS tenant_isolation_rule_definition ON public.rule_definition;
DROP POLICY IF EXISTS tenant_isolation_redemption_allocation ON public.redemption_allocation;
DROP POLICY IF EXISTS tenant_isolation_member_unique_key ON public.member_unique_key;
DROP POLICY IF EXISTS tenant_isolation_member_tier ON public.member_tier;
DROP POLICY IF EXISTS tenant_isolation_member_merge_task ON public.member_merge_task;
DROP POLICY IF EXISTS tenant_isolation_member_account ON public.member_account;
DROP POLICY IF EXISTS tenant_isolation_member ON public.member;
DROP POLICY IF EXISTS tenant_isolation_flow_definition ON public.flow_definition;
DROP POLICY IF EXISTS tenant_isolation_event_inbox ON public.event_inbox;
DROP POLICY IF EXISTS tenant_isolation_channel_adapter_config ON public.channel_adapter_config;
DROP POLICY IF EXISTS tenant_isolation_account_transaction ON public.account_transaction;
ALTER TABLE IF EXISTS ONLY public.tier_definition DROP CONSTRAINT IF EXISTS tier_definition_program_code_fkey;
ALTER TABLE IF EXISTS ONLY public.tenant_quota_usage DROP CONSTRAINT IF EXISTS tenant_quota_usage_tenant_id_fkey;
ALTER TABLE IF EXISTS ONLY public.simulation_job DROP CONSTRAINT IF EXISTS simulation_job_rule_id_fkey;
ALTER TABLE IF EXISTS ONLY public.simulation_job DROP CONSTRAINT IF EXISTS simulation_job_program_code_fkey;
ALTER TABLE IF EXISTS ONLY public.simulation_job DROP CONSTRAINT IF EXISTS simulation_job_async_job_id_fkey;
ALTER TABLE IF EXISTS ONLY public.schema_version DROP CONSTRAINT IF EXISTS schema_version_program_code_fkey;
ALTER TABLE IF EXISTS ONLY public.rule_definition DROP CONSTRAINT IF EXISTS rule_definition_program_code_fkey;
ALTER TABLE IF EXISTS ONLY public.redemption_allocation DROP CONSTRAINT IF EXISTS redemption_allocation_redemption_transaction_id_fkey;
ALTER TABLE IF EXISTS ONLY public.redemption_allocation DROP CONSTRAINT IF EXISTS redemption_allocation_accrual_transaction_id_fkey;
ALTER TABLE IF EXISTS ONLY public.program_user_role DROP CONSTRAINT IF EXISTS program_user_role_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.program_user_role DROP CONSTRAINT IF EXISTS program_user_role_program_code_fkey;
ALTER TABLE IF EXISTS ONLY public.program DROP CONSTRAINT IF EXISTS program_tenant_id_fkey;
ALTER TABLE IF EXISTS ONLY public.merchant_app DROP CONSTRAINT IF EXISTS merchant_app_tenant_id_fkey;
ALTER TABLE IF EXISTS ONLY public.member DROP CONSTRAINT IF EXISTS member_program_code_fkey;
ALTER TABLE IF EXISTS ONLY public.member_account DROP CONSTRAINT IF EXISTS member_account_program_code_fkey;
ALTER TABLE IF EXISTS ONLY public.export_task DROP CONSTRAINT IF EXISTS export_task_async_job_id_fkey;
ALTER TABLE IF EXISTS ONLY public.export_task DROP CONSTRAINT IF EXISTS export_task_approval_id_fkey;
ALTER TABLE IF EXISTS ONLY public.custom_entity_definition DROP CONSTRAINT IF EXISTS custom_entity_definition_program_code_fkey;
ALTER TABLE IF EXISTS ONLY public.channel_adapter_config DROP CONSTRAINT IF EXISTS channel_adapter_config_program_code_fkey;
ALTER TABLE IF EXISTS ONLY public.cascade_recalc_job DROP CONSTRAINT IF EXISTS cascade_recalc_job_async_job_id_fkey;
ALTER TABLE IF EXISTS ONLY public.account_transaction DROP CONSTRAINT IF EXISTS account_transaction_account_id_fkey;
DROP INDEX IF EXISTS public.uk_txn_idempotency;
DROP INDEX IF EXISTS public.uk_at_idempotent_operation;
DROP INDEX IF EXISTS public.idx_txn_type_status;
DROP INDEX IF EXISTS public.idx_txn_status;
DROP INDEX IF EXISTS public.idx_txn_related;
DROP INDEX IF EXISTS public.idx_txn_member_time;
DROP INDEX IF EXISTS public.idx_tcl_member;
DROP INDEX IF EXISTS public.idx_sim_status;
DROP INDEX IF EXISTS public.idx_rule_status;
DROP INDEX IF EXISTS public.idx_rule_code;
DROP INDEX IF EXISTS public.idx_outbox_status_channel;
DROP INDEX IF EXISTS public.idx_outbox_next_retry;
DROP INDEX IF EXISTS public.idx_np_member;
DROP INDEX IF EXISTS public.idx_notification_unread;
DROP INDEX IF EXISTS public.idx_notification_program_user;
DROP INDEX IF EXISTS public.idx_notification_program_read;
DROP INDEX IF EXISTS public.idx_mmt_program_status;
DROP INDEX IF EXISTS public.idx_mmt_main_member;
DROP INDEX IF EXISTS public.idx_member_mobile;
DROP INDEX IF EXISTS public.idx_fd_program;
DROP INDEX IF EXISTS public.idx_export_task_program_type;
DROP INDEX IF EXISTS public.idx_export_task_program_status;
DROP INDEX IF EXISTS public.idx_custom_entity_parent;
DROP INDEX IF EXISTS public.idx_crl_reverse;
DROP INDEX IF EXISTS public.idx_audit_entity;
DROP INDEX IF EXISTS public.idx_audit_action;
DROP INDEX IF EXISTS public.idx_at_member_type_created;
DROP INDEX IF EXISTS public.idx_at_member_expires;
DROP INDEX IF EXISTS public.idx_at_event;
DROP INDEX IF EXISTS public.idx_at_active_accrual;
DROP INDEX IF EXISTS public.idx_async_job_status;
DROP INDEX IF EXISTS public.idx_approval_pending;
DROP INDEX IF EXISTS public.flyway_schema_history_s_idx;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.transaction_event DROP CONSTRAINT IF EXISTS transaction_event_pkey;
ALTER TABLE IF EXISTS ONLY public.tier_definition DROP CONSTRAINT IF EXISTS tier_definition_pkey;
ALTER TABLE IF EXISTS ONLY public.tier_change_log DROP CONSTRAINT IF EXISTS tier_change_log_pkey;
ALTER TABLE IF EXISTS ONLY public.tenant_quota_usage DROP CONSTRAINT IF EXISTS tenant_quota_usage_tenant_id_program_code_metric_date_key;
ALTER TABLE IF EXISTS ONLY public.tenant_quota_usage DROP CONSTRAINT IF EXISTS tenant_quota_usage_pkey;
ALTER TABLE IF EXISTS ONLY public.tenant DROP CONSTRAINT IF EXISTS tenant_pkey;
ALTER TABLE IF EXISTS ONLY public.system_enum DROP CONSTRAINT IF EXISTS system_enum_program_code_enum_type_enum_code_key;
ALTER TABLE IF EXISTS ONLY public.system_enum DROP CONSTRAINT IF EXISTS system_enum_pkey;
ALTER TABLE IF EXISTS ONLY public.simulation_job DROP CONSTRAINT IF EXISTS simulation_job_pkey;
ALTER TABLE IF EXISTS ONLY public.schema_version DROP CONSTRAINT IF EXISTS schema_version_program_code_schema_type_schema_code_version_key;
ALTER TABLE IF EXISTS ONLY public.schema_version DROP CONSTRAINT IF EXISTS schema_version_pkey;
ALTER TABLE IF EXISTS ONLY public.rule_snapshot DROP CONSTRAINT IF EXISTS rule_snapshot_program_code_snapshot_version_key;
ALTER TABLE IF EXISTS ONLY public.rule_snapshot DROP CONSTRAINT IF EXISTS rule_snapshot_pkey;
ALTER TABLE IF EXISTS ONLY public.rule_definition DROP CONSTRAINT IF EXISTS rule_definition_program_code_rule_code_version_key;
ALTER TABLE IF EXISTS ONLY public.rule_definition DROP CONSTRAINT IF EXISTS rule_definition_pkey;
ALTER TABLE IF EXISTS ONLY public.reverse_event DROP CONSTRAINT IF EXISTS reverse_event_program_code_reverse_event_id_key;
ALTER TABLE IF EXISTS ONLY public.reverse_event DROP CONSTRAINT IF EXISTS reverse_event_pkey;
ALTER TABLE IF EXISTS ONLY public.redemption_allocation DROP CONSTRAINT IF EXISTS redemption_allocation_program_code_redemption_transaction_i_key;
ALTER TABLE IF EXISTS ONLY public.redemption_allocation DROP CONSTRAINT IF EXISTS redemption_allocation_pkey;
ALTER TABLE IF EXISTS ONLY public.program_user_role DROP CONSTRAINT IF EXISTS program_user_role_pkey;
ALTER TABLE IF EXISTS ONLY public.program DROP CONSTRAINT IF EXISTS program_pkey;
ALTER TABLE IF EXISTS ONLY public.point_type_definition DROP CONSTRAINT IF EXISTS point_type_definition_program_code_type_code_key;
ALTER TABLE IF EXISTS ONLY public.point_type_definition DROP CONSTRAINT IF EXISTS point_type_definition_pkey;
ALTER TABLE IF EXISTS ONLY public.notification DROP CONSTRAINT IF EXISTS notification_pkey;
ALTER TABLE IF EXISTS ONLY public.notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_pkey;
ALTER TABLE IF EXISTS ONLY public.negative_pending DROP CONSTRAINT IF EXISTS negative_pending_pkey;
ALTER TABLE IF EXISTS ONLY public.merchant_app DROP CONSTRAINT IF EXISTS merchant_app_pkey;
ALTER TABLE IF EXISTS ONLY public.merchant_app DROP CONSTRAINT IF EXISTS merchant_app_app_key_key;
ALTER TABLE IF EXISTS ONLY public.member_unique_key DROP CONSTRAINT IF EXISTS member_unique_key_pkey;
ALTER TABLE IF EXISTS ONLY public.member_tier DROP CONSTRAINT IF EXISTS member_tier_pkey;
ALTER TABLE IF EXISTS ONLY public.member DROP CONSTRAINT IF EXISTS member_pkey;
ALTER TABLE IF EXISTS ONLY public.member_merge_task DROP CONSTRAINT IF EXISTS member_merge_task_pkey;
ALTER TABLE IF EXISTS ONLY public.member_fifo_cursor DROP CONSTRAINT IF EXISTS member_fifo_cursor_pkey;
ALTER TABLE IF EXISTS ONLY public.member_account DROP CONSTRAINT IF EXISTS member_account_program_code_member_id_account_type_key;
ALTER TABLE IF EXISTS ONLY public.member_account DROP CONSTRAINT IF EXISTS member_account_pkey;
ALTER TABLE IF EXISTS ONLY public.flyway_schema_history DROP CONSTRAINT IF EXISTS flyway_schema_history_pk;
ALTER TABLE IF EXISTS ONLY public.flow_definition DROP CONSTRAINT IF EXISTS flow_definition_program_code_chain_name_key;
ALTER TABLE IF EXISTS ONLY public.flow_definition DROP CONSTRAINT IF EXISTS flow_definition_pkey;
ALTER TABLE IF EXISTS ONLY public.export_task DROP CONSTRAINT IF EXISTS export_task_pkey;
ALTER TABLE IF EXISTS ONLY public.event_outbox DROP CONSTRAINT IF EXISTS event_outbox_program_code_idempotency_key_key;
ALTER TABLE IF EXISTS ONLY public.event_outbox DROP CONSTRAINT IF EXISTS event_outbox_pkey;
ALTER TABLE IF EXISTS ONLY public.event_inbox DROP CONSTRAINT IF EXISTS event_inbox_program_code_source_channel_idempotency_key_key;
ALTER TABLE IF EXISTS ONLY public.event_inbox DROP CONSTRAINT IF EXISTS event_inbox_pkey;
ALTER TABLE IF EXISTS ONLY public.custom_entity_definition DROP CONSTRAINT IF EXISTS custom_entity_definition_program_code_entity_name_key;
ALTER TABLE IF EXISTS ONLY public.custom_entity_definition DROP CONSTRAINT IF EXISTS custom_entity_definition_pkey;
ALTER TABLE IF EXISTS ONLY public.custom_entity_data DROP CONSTRAINT IF EXISTS custom_entity_data_pkey;
ALTER TABLE IF EXISTS ONLY public.channel_member_mapping DROP CONSTRAINT IF EXISTS channel_member_mapping_pkey;
ALTER TABLE IF EXISTS ONLY public.channel_credential DROP CONSTRAINT IF EXISTS channel_credential_pkey;
ALTER TABLE IF EXISTS ONLY public.channel_adapter_config DROP CONSTRAINT IF EXISTS channel_adapter_config_program_code_channel_key;
ALTER TABLE IF EXISTS ONLY public.channel_adapter_config DROP CONSTRAINT IF EXISTS channel_adapter_config_pkey;
ALTER TABLE IF EXISTS ONLY public.cascade_recalc_log DROP CONSTRAINT IF EXISTS cascade_recalc_log_pkey;
ALTER TABLE IF EXISTS ONLY public.cascade_recalc_job DROP CONSTRAINT IF EXISTS cascade_recalc_job_program_code_job_id_key;
ALTER TABLE IF EXISTS ONLY public.cascade_recalc_job DROP CONSTRAINT IF EXISTS cascade_recalc_job_pkey;
ALTER TABLE IF EXISTS ONLY public.audit_log DROP CONSTRAINT IF EXISTS audit_log_pkey;
ALTER TABLE IF EXISTS ONLY public.async_job DROP CONSTRAINT IF EXISTS async_job_program_code_job_id_key;
ALTER TABLE IF EXISTS ONLY public.async_job DROP CONSTRAINT IF EXISTS async_job_pkey;
ALTER TABLE IF EXISTS ONLY public.approval DROP CONSTRAINT IF EXISTS approval_pkey;
ALTER TABLE IF EXISTS ONLY public.account_transaction DROP CONSTRAINT IF EXISTS account_transaction_pkey;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tier_change_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tenant_quota_usage ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.tenant ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.system_enum ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.simulation_job ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.schema_version ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.rule_snapshot ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.rule_definition ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.reverse_event ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.redemption_allocation ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.point_type_definition ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notification_outbox ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.notification ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.negative_pending ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.merchant_app ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.member_merge_task ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.member_account ALTER COLUMN account_id DROP DEFAULT;
ALTER TABLE IF EXISTS public.flow_definition ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.export_task ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.event_outbox ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.event_inbox ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.custom_entity_definition ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.custom_entity_data ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.channel_credential ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.channel_adapter_config ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.cascade_recalc_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.cascade_recalc_job ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.audit_log ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.async_job ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.approval ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.account_transaction ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.transaction_event;
DROP TABLE IF EXISTS public.tier_definition;
DROP SEQUENCE IF EXISTS public.tier_change_log_id_seq;
DROP TABLE IF EXISTS public.tier_change_log;
DROP SEQUENCE IF EXISTS public.tenant_quota_usage_id_seq;
DROP TABLE IF EXISTS public.tenant_quota_usage;
DROP SEQUENCE IF EXISTS public.tenant_id_seq;
DROP TABLE IF EXISTS public.tenant;
DROP SEQUENCE IF EXISTS public.system_enum_id_seq;
DROP TABLE IF EXISTS public.system_enum;
DROP SEQUENCE IF EXISTS public.simulation_job_id_seq;
DROP TABLE IF EXISTS public.simulation_job;
DROP SEQUENCE IF EXISTS public.schema_version_id_seq;
DROP TABLE IF EXISTS public.schema_version;
DROP SEQUENCE IF EXISTS public.rule_snapshot_id_seq;
DROP TABLE IF EXISTS public.rule_snapshot;
DROP SEQUENCE IF EXISTS public.rule_definition_id_seq;
DROP TABLE IF EXISTS public.rule_definition;
DROP SEQUENCE IF EXISTS public.reverse_event_id_seq;
DROP TABLE IF EXISTS public.reverse_event;
DROP SEQUENCE IF EXISTS public.redemption_allocation_id_seq;
DROP TABLE IF EXISTS public.redemption_allocation;
DROP TABLE IF EXISTS public.program_user_role;
DROP TABLE IF EXISTS public.program;
DROP SEQUENCE IF EXISTS public.point_type_definition_id_seq;
DROP TABLE IF EXISTS public.point_type_definition;
DROP SEQUENCE IF EXISTS public.notification_outbox_id_seq;
DROP TABLE IF EXISTS public.notification_outbox;
DROP SEQUENCE IF EXISTS public.notification_id_seq;
DROP TABLE IF EXISTS public.notification;
DROP SEQUENCE IF EXISTS public.negative_pending_id_seq;
DROP TABLE IF EXISTS public.negative_pending;
DROP SEQUENCE IF EXISTS public.merchant_app_id_seq;
DROP TABLE IF EXISTS public.merchant_app;
DROP TABLE IF EXISTS public.member_unique_key;
DROP TABLE IF EXISTS public.member_tier;
DROP SEQUENCE IF EXISTS public.member_merge_task_id_seq;
DROP TABLE IF EXISTS public.member_merge_task;
DROP TABLE IF EXISTS public.member_fifo_cursor;
DROP SEQUENCE IF EXISTS public.member_account_account_id_seq;
DROP TABLE IF EXISTS public.member_account;
DROP TABLE IF EXISTS public.member;
DROP TABLE IF EXISTS public.flyway_schema_history;
DROP SEQUENCE IF EXISTS public.flow_definition_id_seq;
DROP TABLE IF EXISTS public.flow_definition;
DROP SEQUENCE IF EXISTS public.export_task_id_seq;
DROP TABLE IF EXISTS public.export_task;
DROP SEQUENCE IF EXISTS public.event_outbox_id_seq;
DROP TABLE IF EXISTS public.event_outbox;
DROP SEQUENCE IF EXISTS public.event_inbox_id_seq;
DROP TABLE IF EXISTS public.event_inbox;
DROP SEQUENCE IF EXISTS public.custom_entity_definition_id_seq;
DROP TABLE IF EXISTS public.custom_entity_definition;
DROP SEQUENCE IF EXISTS public.custom_entity_data_id_seq;
DROP TABLE IF EXISTS public.custom_entity_data;
DROP TABLE IF EXISTS public.channel_member_mapping;
DROP SEQUENCE IF EXISTS public.channel_credential_id_seq;
DROP TABLE IF EXISTS public.channel_credential;
DROP SEQUENCE IF EXISTS public.channel_adapter_config_id_seq;
DROP TABLE IF EXISTS public.channel_adapter_config;
DROP SEQUENCE IF EXISTS public.cascade_recalc_log_id_seq;
DROP TABLE IF EXISTS public.cascade_recalc_log;
DROP SEQUENCE IF EXISTS public.cascade_recalc_job_id_seq;
DROP TABLE IF EXISTS public.cascade_recalc_job;
DROP SEQUENCE IF EXISTS public.audit_log_id_seq;
DROP TABLE IF EXISTS public.audit_log;
DROP SEQUENCE IF EXISTS public.async_job_id_seq;
DROP TABLE IF EXISTS public.async_job;
DROP SEQUENCE IF EXISTS public.approval_id_seq;
DROP TABLE IF EXISTS public.approval;
DROP SEQUENCE IF EXISTS public.account_transaction_id_seq;
DROP TABLE IF EXISTS public.account_transaction;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_transaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_transaction (
    id bigint NOT NULL,
    account_id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    member_id bigint NOT NULL,
    account_type character varying(50) NOT NULL,
    transaction_type character varying(20) NOT NULL,
    amount numeric(18,4) NOT NULL,
    remaining_amount numeric(18,4),
    expires_at timestamp with time zone,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    reference_event_id character varying(100),
    reversed_by_event_id character varying(100),
    reversal_type character varying(50),
    rule_code character varying(100),
    rule_version integer,
    operation_key character varying(200),
    ext_attributes jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    order_time timestamp with time zone,
    pay_time timestamp with time zone,
    CONSTRAINT account_transaction_check CHECK (((((transaction_type)::text = ANY (ARRAY['ACCRUAL'::text, 'ADJUSTMENT'::text, 'REPAYMENT'::text, 'CREDIT_REPAY'::text, 'REFUND'::text])) AND (amount > (0)::numeric)) OR (((transaction_type)::text = ANY (ARRAY['REDEMPTION'::text, 'EXPIRATION'::text, 'REVERSAL'::text, 'OVERDRAFT'::text, 'CREDIT_DRAWDOWN'::text, 'CASCADE_DEDUCT'::text])) AND (amount < (0)::numeric)) OR ((transaction_type)::text = ANY (ARRAY['SETTLED'::text, 'COMPACTION'::text])))),
    CONSTRAINT account_transaction_remaining_amount_check CHECK (((remaining_amount IS NULL) OR (remaining_amount >= (- (1000000)::numeric)))),
    CONSTRAINT account_transaction_status_check CHECK (((status)::text = ANY (ARRAY['ACTIVE'::text, 'EXHAUSTED'::text, 'EXPIRED'::text, 'REVERSED'::text, 'REVERSED_BY_CASCADE'::text, 'PENDING'::text, 'SETTLED'::text, 'OVERDRAFT'::text]))),
    CONSTRAINT account_transaction_transaction_type_check CHECK (((transaction_type)::text = ANY (ARRAY['ACCRUAL'::text, 'ADJUSTMENT'::text, 'REPAYMENT'::text, 'CREDIT_REPAY'::text, 'REFUND'::text, 'REDEMPTION'::text, 'EXPIRATION'::text, 'REVERSAL'::text, 'OVERDRAFT'::text, 'CREDIT_DRAWDOWN'::text, 'CASCADE_DEDUCT'::text, 'SETTLED'::text, 'COMPACTION'::text])))
);


--
-- Name: account_transaction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.account_transaction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: account_transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.account_transaction_id_seq OWNED BY public.account_transaction.id;


--
-- Name: approval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    approval_type character varying(50) NOT NULL,
    target_type character varying(50) NOT NULL,
    target_id character varying(100) NOT NULL,
    applicant_id bigint NOT NULL,
    approver_id bigint,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    summary jsonb,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now(),
    approved_at timestamp with time zone,
    CONSTRAINT approval_check CHECK (((applicant_id <> approver_id) OR (approver_id IS NULL))),
    CONSTRAINT approval_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: approval_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.approval_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: approval_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.approval_id_seq OWNED BY public.approval.id;


--
-- Name: async_job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.async_job (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    job_type character varying(50) NOT NULL,
    job_id character varying(100) NOT NULL,
    status character varying(20) DEFAULT 'QUEUED'::character varying NOT NULL,
    parameters jsonb,
    progress integer DEFAULT 0,
    result_report jsonb,
    error_message text,
    created_by bigint,
    trace_id character varying(100),
    retry_count integer DEFAULT 0,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT async_job_status_check CHECK (((status)::text = ANY ((ARRAY['QUEUED'::character varying, 'RUNNING'::character varying, 'SUCCEEDED'::character varying, 'FAILED'::character varying, 'CANCELLED'::character varying, 'REQUIRES_APPROVAL'::character varying])::text[])))
);


--
-- Name: async_job_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.async_job_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: async_job_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.async_job_id_seq OWNED BY public.async_job.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    user_id bigint,
    trace_id character varying(100),
    request_id character varying(100),
    client_ip character varying(80),
    user_agent character varying(500),
    action character varying(100) NOT NULL,
    entity_type character varying(50),
    entity_id character varying(100),
    risk_level character varying(20) DEFAULT 'LOW'::character varying NOT NULL,
    approval_id character varying(100),
    before_summary jsonb,
    after_summary jsonb,
    details jsonb,
    prev_hash character varying(128),
    current_hash character varying(128),
    retention_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT audit_log_risk_level_check CHECK (((risk_level)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'CRITICAL'::character varying])::text[])))
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: cascade_recalc_job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cascade_recalc_job (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    async_job_id bigint,
    job_id character varying(100) NOT NULL,
    reverse_event_id character varying(100) NOT NULL,
    member_id bigint NOT NULL,
    status character varying(30) DEFAULT 'PENDING'::character varying NOT NULL,
    cursor_event_time timestamp with time zone,
    affected_count integer DEFAULT 0,
    compensation_status character varying(30),
    error_message text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT cascade_recalc_job_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'RUNNING'::character varying, 'SUCCEEDED'::character varying, 'FAILED'::character varying, 'COMPENSATING'::character varying, 'REQUIRES_APPROVAL'::character varying])::text[])))
);


--
-- Name: cascade_recalc_job_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cascade_recalc_job_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cascade_recalc_job_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cascade_recalc_job_id_seq OWNED BY public.cascade_recalc_job.id;


--
-- Name: cascade_recalc_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cascade_recalc_log (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    reverse_event_id character varying(100) NOT NULL,
    member_id bigint NOT NULL,
    affected_event_id character varying(100),
    original_points numeric(20,2),
    recalculated_points numeric(20,2),
    points_diff numeric(20,2),
    original_tier character varying(50),
    recalculated_tier character varying(50),
    recalc_order integer,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cascade_recalc_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cascade_recalc_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cascade_recalc_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cascade_recalc_log_id_seq OWNED BY public.cascade_recalc_log.id;


--
-- Name: channel_adapter_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_adapter_config (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    channel character varying(50) NOT NULL,
    auth_config jsonb,
    request_mapping jsonb,
    response_mapping jsonb,
    rate_limit_config jsonb,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT channel_adapter_config_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'ROTATING'::character varying, 'REVOKED'::character varying, 'EXPIRED'::character varying])::text[])))
);


--
-- Name: channel_adapter_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.channel_adapter_config_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: channel_adapter_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.channel_adapter_config_id_seq OWNED BY public.channel_adapter_config.id;


--
-- Name: channel_credential; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_credential (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    channel character varying(50) NOT NULL,
    credential_type character varying(50) NOT NULL,
    key_version integer DEFAULT 1 NOT NULL,
    encrypted_value text NOT NULL,
    kms_key_ref character varying(200),
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_by bigint NOT NULL,
    approved_by bigint,
    effective_at timestamp with time zone,
    expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT channel_credential_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'ROTATING'::character varying, 'REVOKED'::character varying, 'EXPIRED'::character varying])::text[])))
);


--
-- Name: channel_credential_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.channel_credential_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: channel_credential_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.channel_credential_id_seq OWNED BY public.channel_credential.id;


--
-- Name: channel_member_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_member_mapping (
    program_code character varying(100) NOT NULL,
    channel character varying(50) NOT NULL,
    channel_member_id character varying(200) NOT NULL,
    member_id bigint NOT NULL
);


--
-- Name: custom_entity_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_entity_data (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    entity_name character varying(100) NOT NULL,
    entity_id character varying(100) NOT NULL,
    parent_entity_type character varying(50),
    parent_id character varying(100),
    attributes jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: custom_entity_data_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_entity_data_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custom_entity_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_entity_data_id_seq OWNED BY public.custom_entity_data.id;


--
-- Name: custom_entity_definition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_entity_definition (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    entity_name character varying(100) NOT NULL,
    relationship_type character varying(20),
    related_core_entity character varying(50),
    foreign_key_field character varying(100),
    schema_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: custom_entity_definition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_entity_definition_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: custom_entity_definition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_entity_definition_id_seq OWNED BY public.custom_entity_definition.id;


--
-- Name: event_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_inbox (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    source_channel character varying(50) NOT NULL,
    source_event_id character varying(200),
    idempotency_key character varying(300) NOT NULL,
    payload_hash character varying(128) NOT NULL,
    payload jsonb NOT NULL,
    signature_verified boolean DEFAULT false,
    signature_detail jsonb,
    status character varying(30) DEFAULT 'RECEIVED'::character varying NOT NULL,
    retry_count integer DEFAULT 0,
    error_message text,
    trace_id character varying(100),
    first_seen_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    max_retry integer DEFAULT 3,
    reject_reason character varying(50),
    next_retry_at timestamp with time zone,
    CONSTRAINT event_inbox_status_check CHECK (((status)::text = ANY (ARRAY['RECEIVED'::text, 'VALIDATING'::text, 'VALIDATED'::text, 'PROCESSING'::text, 'WAITING_DEPENDENCY'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'DEAD_LETTER'::text, 'TRANSFORM_FAILED'::text, 'RETRYING'::text, 'DEAD'::text, 'REJECTED'::text])))
);


--
-- Name: event_inbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.event_inbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: event_inbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.event_inbox_id_seq OWNED BY public.event_inbox.id;


--
-- Name: event_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_outbox (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    aggregate_type character varying(50) NOT NULL,
    aggregate_id character varying(100) NOT NULL,
    event_type character varying(100) NOT NULL,
    idempotency_key character varying(300) NOT NULL,
    payload jsonb NOT NULL,
    status character varying(30) DEFAULT 'PENDING'::character varying NOT NULL,
    retry_count integer DEFAULT 0,
    next_retry_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    published_at timestamp with time zone,
    CONSTRAINT event_outbox_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PUBLISHED'::character varying, 'FAILED'::character varying, 'DEAD_LETTER'::character varying])::text[])))
);


--
-- Name: event_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.event_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: event_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.event_outbox_id_seq OWNED BY public.event_outbox.id;


--
-- Name: export_task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.export_task (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    async_job_id bigint,
    export_type character varying(50) NOT NULL,
    exported_by bigint NOT NULL,
    filter_conditions jsonb,
    field_scope jsonb,
    file_path character varying(500),
    file_size bigint,
    expires_at timestamp with time zone,
    watermark_info jsonb,
    approval_id bigint,
    created_at timestamp with time zone DEFAULT now(),
    status character varying(20) DEFAULT 'QUEUED'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    error_message text,
    CONSTRAINT chk_export_task_status CHECK (((status)::text = ANY ((ARRAY['QUEUED'::character varying, 'PROCESSING'::character varying, 'COMPLETED'::character varying, 'FAILED'::character varying, 'EXPIRED'::character varying])::text[])))
);


--
-- Name: export_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.export_task_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: export_task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.export_task_id_seq OWNED BY public.export_task.id;


--
-- Name: flow_definition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flow_definition (
    id bigint NOT NULL,
    program_code character varying(32) NOT NULL,
    chain_name character varying(64) NOT NULL,
    chain_type character varying(32) NOT NULL,
    flow_graph jsonb NOT NULL,
    el_expression text NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying,
    version integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone
);


--
-- Name: flow_definition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.flow_definition_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: flow_definition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.flow_definition_id_seq OWNED BY public.flow_definition.id;


--
-- Name: flyway_schema_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flyway_schema_history (
    installed_rank integer NOT NULL,
    version character varying(50),
    description character varying(200) NOT NULL,
    type character varying(20) NOT NULL,
    script character varying(1000) NOT NULL,
    checksum integer,
    installed_by character varying(100) NOT NULL,
    installed_on timestamp without time zone DEFAULT now() NOT NULL,
    execution_time integer NOT NULL,
    success boolean NOT NULL
);


--
-- Name: member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member (
    program_code character varying(100) NOT NULL,
    member_id bigint NOT NULL,
    status character varying(20) DEFAULT 'ENROLLED'::character varying NOT NULL,
    ext_attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    merged_to_member_id bigint,
    schema_version character varying(16),
    tier_code character varying(16),
    name character varying(100),
    gender character varying(10),
    birthday date,
    CONSTRAINT member_status_check CHECK (((status)::text = ANY ((ARRAY['ENROLLED'::character varying, 'SUSPENDED'::character varying, 'MERGED'::character varying, 'DEACTIVATED'::character varying])::text[])))
);


--
-- Name: member_account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_account (
    account_id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    member_id bigint NOT NULL,
    account_type character varying(50) NOT NULL,
    total_accrued numeric(20,2) DEFAULT 0,
    total_redeemed numeric(20,2) DEFAULT 0,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    overdraft_limit numeric(20,4) DEFAULT 0,
    credit_limit numeric(20,4) DEFAULT 0,
    credit_used numeric(20,4) DEFAULT 0,
    total_expired numeric(20,4) DEFAULT 0,
    frozen_status character varying(16) DEFAULT 'ACTIVE'::character varying
);


--
-- Name: member_account_account_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_account_account_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: member_account_account_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_account_account_id_seq OWNED BY public.member_account.account_id;


--
-- Name: member_fifo_cursor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_fifo_cursor (
    program_code character varying(32) NOT NULL,
    member_id character varying(64) NOT NULL,
    account_type character varying(50) NOT NULL,
    last_tx_id bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: member_merge_task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_merge_task (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    main_member_id bigint NOT NULL,
    duplicate_member_id bigint NOT NULL,
    status character varying(20) DEFAULT 'CREATED'::character varying NOT NULL,
    error_message character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: member_merge_task_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_merge_task_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: member_merge_task_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_merge_task_id_seq OWNED BY public.member_merge_task.id;


--
-- Name: member_tier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_tier (
    program_code character varying(100) NOT NULL,
    member_id bigint NOT NULL,
    current_tier character varying(50) NOT NULL,
    previous_tier character varying(50),
    upgrade_source_event_id character varying(100),
    effective_date date NOT NULL,
    next_evaluation_date date,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: member_unique_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_unique_key (
    program_code character varying(100) NOT NULL,
    key_combination character varying(100) NOT NULL,
    key_value character varying(500) NOT NULL,
    member_id bigint NOT NULL,
    is_strong boolean DEFAULT true,
    is_verified boolean DEFAULT false,
    verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: merchant_app; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.merchant_app (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    app_key character varying(100) NOT NULL,
    app_secret_hash character varying(255) NOT NULL,
    authorized_programs jsonb NOT NULL,
    api_permissions jsonb,
    qps_limit integer DEFAULT 100,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT merchant_app_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'SUSPENDED'::character varying, 'REVOKED'::character varying])::text[])))
);


--
-- Name: merchant_app_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.merchant_app_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: merchant_app_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.merchant_app_id_seq OWNED BY public.merchant_app.id;


--
-- Name: negative_pending; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.negative_pending (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    member_id bigint NOT NULL,
    account_type character varying(50) NOT NULL,
    pending_amount numeric(20,2) NOT NULL,
    source_reverse_event_id character varying(100) NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    settled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT negative_pending_pending_amount_check CHECK ((pending_amount > (0)::numeric)),
    CONSTRAINT negative_pending_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'SETTLING'::character varying, 'SETTLED'::character varying, 'EXPIRED'::character varying])::text[])))
);


--
-- Name: negative_pending_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.negative_pending_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: negative_pending_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.negative_pending_id_seq OWNED BY public.negative_pending.id;


--
-- Name: notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    user_id bigint NOT NULL,
    notification_type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    detail jsonb,
    is_read boolean DEFAULT false,
    related_entity_type character varying(50),
    related_entity_id character varying(100),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: notification_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_id_seq OWNED BY public.notification.id;


--
-- Name: notification_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_outbox (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    member_id bigint,
    event_type character varying(50) NOT NULL,
    channel character varying(20) NOT NULL,
    recipient character varying(200) NOT NULL,
    template_code character varying(100),
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    retry_count integer DEFAULT 0,
    max_retry integer DEFAULT 3,
    error_message text,
    locked_by character varying(100),
    locked_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notification_outbox_channel_check CHECK (((channel)::text = ANY ((ARRAY['SMS'::character varying, 'WECHAT_TEMPLATE'::character varying, 'APP_PUSH'::character varying, 'EMAIL'::character varying])::text[]))),
    CONSTRAINT notification_outbox_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'SENDING'::character varying, 'SENT'::character varying, 'RETRY'::character varying, 'FAILED'::character varying, 'DEAD'::character varying])::text[])))
);


--
-- Name: notification_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_outbox_id_seq OWNED BY public.notification_outbox.id;


--
-- Name: point_type_definition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.point_type_definition (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    type_code character varying(50) NOT NULL,
    type_name character varying(100),
    is_redeemable boolean DEFAULT true,
    is_tier_calc boolean DEFAULT false,
    is_transferable boolean DEFAULT false,
    allow_negative boolean DEFAULT false,
    expiry_days integer DEFAULT 365,
    config_json jsonb DEFAULT '{}'::jsonb,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    expiry_mode character varying(30) DEFAULT 'FIXED_DAYS'::character varying,
    expiry_value integer DEFAULT 365,
    is_visible boolean DEFAULT true,
    overdraft_limit numeric(20,4) DEFAULT 0,
    credit_limit numeric(20,4) DEFAULT 0
);


--
-- Name: point_type_definition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.point_type_definition_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: point_type_definition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.point_type_definition_id_seq OWNED BY public.point_type_definition.id;


--
-- Name: program; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program (
    code character varying(100) NOT NULL,
    tenant_id bigint NOT NULL,
    name character varying(200) NOT NULL,
    timezone character varying(50) DEFAULT 'Asia/Shanghai'::character varying,
    currency character varying(10) DEFAULT 'CNY'::character varying,
    config_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    created_by bigint,
    updated_by bigint,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT program_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'PAUSED'::character varying, 'ARCHIVED'::character varying])::text[])))
);


--
-- Name: program_user_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.program_user_role (
    user_id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    role_code character varying(50) NOT NULL,
    granted_by bigint,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: redemption_allocation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.redemption_allocation (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    redemption_transaction_id bigint NOT NULL,
    accrual_transaction_id bigint NOT NULL,
    allocated_amount numeric(20,2) NOT NULL,
    allocation_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT redemption_allocation_allocated_amount_check CHECK ((allocated_amount > (0)::numeric))
);


--
-- Name: redemption_allocation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.redemption_allocation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: redemption_allocation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.redemption_allocation_id_seq OWNED BY public.redemption_allocation.id;


--
-- Name: reverse_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reverse_event (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    reverse_event_id character varying(100) NOT NULL,
    original_event_id character varying(100) NOT NULL,
    reverse_type character varying(50) NOT NULL,
    refund_amount numeric(20,2),
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    result_detail jsonb,
    created_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT reverse_event_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'SUCCEEDED'::character varying, 'FAILED'::character varying, 'COMPENSATING'::character varying])::text[])))
);


--
-- Name: reverse_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reverse_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reverse_event_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reverse_event_id_seq OWNED BY public.reverse_event.id;


--
-- Name: rule_definition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule_definition (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    rule_code character varying(100) NOT NULL,
    rule_name character varying(200),
    rule_type character varying(50),
    rule_category character varying(50) DEFAULT 'forward'::character varying,
    drl_content text NOT NULL,
    version integer DEFAULT 1,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT rule_definition_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'TESTED'::character varying, 'ACTIVE'::character varying, 'ARCHIVED'::character varying])::text[])))
);


--
-- Name: rule_definition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rule_definition_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rule_definition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rule_definition_id_seq OWNED BY public.rule_definition.id;


--
-- Name: rule_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rule_snapshot (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    snapshot_version character varying(100) NOT NULL,
    kie_release_id character varying(100),
    rule_ids jsonb NOT NULL,
    drl_bundle text NOT NULL,
    created_by bigint,
    approved_by bigint,
    created_at timestamp with time zone DEFAULT now(),
    published_at timestamp with time zone
);


--
-- Name: rule_snapshot_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rule_snapshot_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rule_snapshot_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rule_snapshot_id_seq OWNED BY public.rule_snapshot.id;


--
-- Name: schema_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_version (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    schema_type character varying(50) NOT NULL,
    schema_code character varying(100) NOT NULL,
    version integer NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    schema_json jsonb NOT NULL,
    impact_report jsonb,
    created_by bigint,
    created_at timestamp with time zone DEFAULT now(),
    published_at timestamp with time zone,
    CONSTRAINT schema_version_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'PUBLISHED'::character varying, 'ARCHIVED'::character varying])::text[])))
);


--
-- Name: schema_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_version_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_version_id_seq OWNED BY public.schema_version.id;


--
-- Name: simulation_job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.simulation_job (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    async_job_id bigint,
    rule_id bigint,
    simulation_type character varying(50),
    status character varying(20) DEFAULT 'QUEUED'::character varying NOT NULL,
    parameters jsonb,
    result_report jsonb,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT simulation_job_status_check CHECK (((status)::text = ANY ((ARRAY['QUEUED'::character varying, 'RUNNING'::character varying, 'SUCCEEDED'::character varying, 'FAILED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: simulation_job_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.simulation_job_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: simulation_job_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.simulation_job_id_seq OWNED BY public.simulation_job.id;


--
-- Name: system_enum; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_enum (
    id bigint NOT NULL,
    program_code character varying(32) DEFAULT 'SYSTEM'::character varying NOT NULL,
    enum_type character varying(50) NOT NULL,
    enum_code character varying(100) NOT NULL,
    enum_name character varying(200) NOT NULL,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: system_enum_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_enum_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_enum_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_enum_id_seq OWNED BY public.system_enum.id;


--
-- Name: tenant; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant (
    id bigint NOT NULL,
    name character varying(200) NOT NULL,
    status character varying(20) DEFAULT 'TRIAL'::character varying NOT NULL,
    plan_type character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tenant_status_check CHECK (((status)::text = ANY ((ARRAY['TRIAL'::character varying, 'ACTIVE'::character varying, 'SUSPENDED'::character varying, 'TERMINATED'::character varying])::text[])))
);


--
-- Name: tenant_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_id_seq OWNED BY public.tenant.id;


--
-- Name: tenant_quota_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_quota_usage (
    id bigint NOT NULL,
    tenant_id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    metric_date date NOT NULL,
    transaction_count integer DEFAULT 0,
    member_count integer DEFAULT 0,
    rule_count integer DEFAULT 0,
    export_count integer DEFAULT 0,
    api_call_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenant_quota_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_quota_usage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_quota_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_quota_usage_id_seq OWNED BY public.tenant_quota_usage.id;


--
-- Name: tier_change_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tier_change_log (
    id bigint NOT NULL,
    program_code character varying(100) NOT NULL,
    member_id bigint NOT NULL,
    from_tier character varying(50),
    to_tier character varying(50),
    change_reason character varying(200),
    event_id character varying(100),
    changed_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tier_change_log_change_reason_check CHECK (((change_reason)::text = ANY ((ARRAY['ORDER_ACCRUAL'::character varying, 'REFUND_REVERSAL'::character varying, 'CASCADE_RECALC'::character varying, 'SCHEDULED_EVALUATION'::character varying, 'MERGE'::character varying, 'MANUAL_ADJUSTMENT'::character varying])::text[])))
);


--
-- Name: tier_change_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tier_change_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tier_change_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tier_change_log_id_seq OWNED BY public.tier_change_log.id;


--
-- Name: tier_definition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tier_definition (
    program_code character varying(100) NOT NULL,
    tier_code character varying(50) NOT NULL,
    tier_name character varying(100),
    sequence integer NOT NULL,
    upgrade_criteria jsonb,
    downgrade_criteria jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by bigint
);


--
-- Name: transaction_event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transaction_event (
    event_id character varying(100) NOT NULL,
    program_code character varying(100) NOT NULL,
    member_id bigint,
    event_type character varying(50) NOT NULL,
    event_time timestamp with time zone NOT NULL,
    channel character varying(50),
    source_event_id character varying(200),
    idempotency_key character varying(300),
    related_event_id character varying(100),
    schema_version integer,
    rule_snapshot_version character varying(100),
    processing_status character varying(30) DEFAULT 'RECEIVED'::character varying NOT NULL,
    trace_id character varying(100),
    error_message text,
    ext_attributes jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    trade_time timestamp with time zone,
    pay_time timestamp with time zone,
    order_amount numeric(20,2),
    trade_status character varying(30),
    CONSTRAINT transaction_event_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['ORDER_PAID'::character varying, 'SIGN_IN'::character varying, 'ENROLLMENT'::character varying, 'ORDER_REFUND_FULL'::character varying, 'ORDER_REFUND_PARTIAL'::character varying, 'REDEMPTION'::character varying, 'REDEMPTION_CANCEL'::character varying, 'ADJUSTMENT'::character varying, 'MERGE'::character varying, 'TIER_CHANGE'::character varying])::text[]))),
    CONSTRAINT transaction_event_processing_status_check CHECK (((processing_status)::text = ANY ((ARRAY['RECEIVED'::character varying, 'VALIDATED'::character varying, 'PROCESSING'::character varying, 'WAITING_DEPENDENCY'::character varying, 'SUCCEEDED'::character varying, 'FAILED'::character varying, 'DEAD_LETTER'::character varying])::text[])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    username character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    email character varying(200),
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    last_login_at timestamp with time zone,
    global_roles jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'SUSPENDED'::character varying, 'LOCKED'::character varying])::text[])))
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: account_transaction id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_transaction ALTER COLUMN id SET DEFAULT nextval('public.account_transaction_id_seq'::regclass);


--
-- Name: approval id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval ALTER COLUMN id SET DEFAULT nextval('public.approval_id_seq'::regclass);


--
-- Name: async_job id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.async_job ALTER COLUMN id SET DEFAULT nextval('public.async_job_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: cascade_recalc_job id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cascade_recalc_job ALTER COLUMN id SET DEFAULT nextval('public.cascade_recalc_job_id_seq'::regclass);


--
-- Name: cascade_recalc_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cascade_recalc_log ALTER COLUMN id SET DEFAULT nextval('public.cascade_recalc_log_id_seq'::regclass);


--
-- Name: channel_adapter_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_adapter_config ALTER COLUMN id SET DEFAULT nextval('public.channel_adapter_config_id_seq'::regclass);


--
-- Name: channel_credential id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_credential ALTER COLUMN id SET DEFAULT nextval('public.channel_credential_id_seq'::regclass);


--
-- Name: custom_entity_data id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_entity_data ALTER COLUMN id SET DEFAULT nextval('public.custom_entity_data_id_seq'::regclass);


--
-- Name: custom_entity_definition id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_entity_definition ALTER COLUMN id SET DEFAULT nextval('public.custom_entity_definition_id_seq'::regclass);


--
-- Name: event_inbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_inbox ALTER COLUMN id SET DEFAULT nextval('public.event_inbox_id_seq'::regclass);


--
-- Name: event_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_outbox ALTER COLUMN id SET DEFAULT nextval('public.event_outbox_id_seq'::regclass);


--
-- Name: export_task id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_task ALTER COLUMN id SET DEFAULT nextval('public.export_task_id_seq'::regclass);


--
-- Name: flow_definition id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_definition ALTER COLUMN id SET DEFAULT nextval('public.flow_definition_id_seq'::regclass);


--
-- Name: member_account account_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_account ALTER COLUMN account_id SET DEFAULT nextval('public.member_account_account_id_seq'::regclass);


--
-- Name: member_merge_task id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_merge_task ALTER COLUMN id SET DEFAULT nextval('public.member_merge_task_id_seq'::regclass);


--
-- Name: merchant_app id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_app ALTER COLUMN id SET DEFAULT nextval('public.merchant_app_id_seq'::regclass);


--
-- Name: negative_pending id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negative_pending ALTER COLUMN id SET DEFAULT nextval('public.negative_pending_id_seq'::regclass);


--
-- Name: notification id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification ALTER COLUMN id SET DEFAULT nextval('public.notification_id_seq'::regclass);


--
-- Name: notification_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_outbox ALTER COLUMN id SET DEFAULT nextval('public.notification_outbox_id_seq'::regclass);


--
-- Name: point_type_definition id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.point_type_definition ALTER COLUMN id SET DEFAULT nextval('public.point_type_definition_id_seq'::regclass);


--
-- Name: redemption_allocation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemption_allocation ALTER COLUMN id SET DEFAULT nextval('public.redemption_allocation_id_seq'::regclass);


--
-- Name: reverse_event id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reverse_event ALTER COLUMN id SET DEFAULT nextval('public.reverse_event_id_seq'::regclass);


--
-- Name: rule_definition id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definition ALTER COLUMN id SET DEFAULT nextval('public.rule_definition_id_seq'::regclass);


--
-- Name: rule_snapshot id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_snapshot ALTER COLUMN id SET DEFAULT nextval('public.rule_snapshot_id_seq'::regclass);


--
-- Name: schema_version id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_version ALTER COLUMN id SET DEFAULT nextval('public.schema_version_id_seq'::regclass);


--
-- Name: simulation_job id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.simulation_job ALTER COLUMN id SET DEFAULT nextval('public.simulation_job_id_seq'::regclass);


--
-- Name: system_enum id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_enum ALTER COLUMN id SET DEFAULT nextval('public.system_enum_id_seq'::regclass);


--
-- Name: tenant id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant ALTER COLUMN id SET DEFAULT nextval('public.tenant_id_seq'::regclass);


--
-- Name: tenant_quota_usage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_quota_usage ALTER COLUMN id SET DEFAULT nextval('public.tenant_quota_usage_id_seq'::regclass);


--
-- Name: tier_change_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_change_log ALTER COLUMN id SET DEFAULT nextval('public.tier_change_log_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: account_transaction; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.account_transaction (id, account_id, program_code, member_id, account_type, transaction_type, amount, remaining_amount, expires_at, status, reference_event_id, reversed_by_event_id, reversal_type, rule_code, rule_version, operation_key, ext_attributes, created_at, updated_at, order_time, pay_time) FROM stdin;
2	1	PROG001	318969221033889792	CONSUMPTION_POINTS	REDEMPTION	-200.0000	\N	\N	ACTIVE	\N	\N	\N	\N	\N	e2e-test-redeem-003	\N	2026-05-30 12:47:45.859491+08	2026-05-30 12:47:45.859491+08	\N	\N
1	1	PROG001	318969221033889792	CONSUMPTION_POINTS	ACCRUAL	500.0000	300.0000	\N	ACTIVE	\N	\N	\N	\N	\N	e2e-test-accrue-003	\N	2026-05-30 12:38:35.925523+08	2026-05-30 12:47:45.869163+08	2026-05-30 12:36:35.925523+08	2026-05-30 12:37:35.925523+08
365	1	PROG001	318969221033889792	REWARD	ACCRUAL	1200.0000	200.0000	2026-12-01 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	tx-init-001	{}	2025-12-01 10:00:00+08	2026-06-07 08:54:21.806551+08	2025-12-01 09:58:00+08	2025-12-01 09:59:00+08
366	1	PROG001	318969221033889792	REWARD	ACCRUAL	800.0000	800.0000	2026-06-01 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	tx-init-002	{}	2026-01-15 14:00:00+08	2026-06-07 08:54:21.806551+08	2026-01-15 13:58:00+08	2026-01-15 13:59:00+08
368	1	PROG001	318969221033889792	REWARD	REDEMPTION	-500.0000	-500.0000	\N	ACTIVE	\N	\N	\N	\N	\N	tx-init-004	{}	2026-04-01 11:00:00+08	2026-06-07 08:54:21.806551+08	\N	\N
369	1	PROG001	318969221033889792	REWARD	REDEMPTION	-300.0000	-300.0000	\N	ACTIVE	\N	\N	\N	\N	\N	tx-init-005	{}	2026-04-15 15:00:00+08	2026-06-07 08:54:21.806551+08	\N	\N
370	1	PROG001	318969221033889792	REWARD	REDEMPTION	-220.0000	-220.0000	\N	ACTIVE	\N	\N	\N	\N	\N	tx-init-006	{}	2026-05-20 10:00:00+08	2026-06-07 08:54:21.806551+08	\N	\N
389	1	PROG001	318969221033889792	REWARD	REDEMPTION	-500.0000	-500.0000	\N	ACTIVE	\N	\N	\N	\N	\N	test-OM-REDEMPTION-TM2026060700001	{}	2026-06-07 12:00:00+08	2026-06-07 15:02:19.967168+08	\N	\N
390	1	PROG001	318969221033889792	REWARD	REDEMPTION	-300.0000	-300.0000	\N	ACTIVE	\N	\N	\N	\N	\N	test-OM-REDEMPTION-TM2026060500001	{}	2026-06-05 15:00:00+08	2026-06-07 15:02:19.967168+08	\N	\N
367	1	PROG001	318969221033889792	REWARD	ACCRUAL	500.0000	280.0000	2026-09-01 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	tx-init-003	{}	2026-03-10 09:00:00+08	2026-06-07 08:54:21.806551+08	2026-03-10 08:58:00+08	2026-03-10 08:59:00+08
371	1	PROG001	318969221033889792	REWARD	ACCRUAL	699.0000	699.0000	2027-06-07 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060700001	{}	2026-06-07 10:23:15+08	2026-06-07 15:02:19.967168+08	2026-06-07 10:21:15+08	2026-06-07 10:22:15+08
372	1	PROG001	318969221033889792	REWARD	ACCRUAL	1280.0000	1280.0000	2027-06-07 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060700002	{}	2026-06-07 11:05:22+08	2026-06-07 15:02:19.967168+08	2026-06-07 11:03:22+08	2026-06-07 11:04:22+08
373	1	PROG001	318969221033889792	REWARD	ACCRUAL	349.0000	349.0000	2027-06-07 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060700003	{}	2026-06-07 14:30:11+08	2026-06-07 15:02:19.967168+08	2026-06-07 14:28:11+08	2026-06-07 14:29:11+08
374	1	PROG001	318969221033889792	REWARD	ACCRUAL	2560.0000	2560.0000	2027-06-06 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060600004	{}	2026-06-06 09:15:33+08	2026-06-07 15:02:19.967168+08	2026-06-06 09:13:33+08	2026-06-06 09:14:33+08
375	1	PROG001	318969221033889792	REWARD	ACCRUAL	168.0000	168.0000	2027-06-06 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060600005	{}	2026-06-06 13:45:18+08	2026-06-07 15:02:19.967168+08	2026-06-06 13:43:18+08	2026-06-06 13:44:18+08
376	1	PROG001	318969221033889792	REWARD	ACCRUAL	499.0000	499.0000	2027-06-06 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060600006	{}	2026-06-06 20:12:05+08	2026-06-07 15:02:19.967168+08	2026-06-06 20:10:05+08	2026-06-06 20:11:05+08
377	1	PROG001	318969221033889792	REWARD	ACCRUAL	890.0000	890.0000	2027-06-05 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060500007	{}	2026-06-05 08:30:00+08	2026-06-07 15:02:19.967168+08	2026-06-05 08:28:00+08	2026-06-05 08:29:00+08
378	1	PROG001	318969221033889792	REWARD	ACCRUAL	2100.0000	2100.0000	2027-06-05 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060500008	{}	2026-06-05 16:22:41+08	2026-06-07 15:02:19.967168+08	2026-06-05 16:20:41+08	2026-06-05 16:21:41+08
379	1	PROG001	318969221033889792	REWARD	ACCRUAL	365.0000	365.0000	2027-06-04 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060400009	{}	2026-06-04 12:18:09+08	2026-06-07 15:02:19.967168+08	2026-06-04 12:16:09+08	2026-06-04 12:17:09+08
380	1	PROG001	318969221033889792	REWARD	ACCRUAL	520.0000	520.0000	2027-06-03 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060300010	{}	2026-06-03 18:55:27+08	2026-06-07 15:02:19.967168+08	2026-06-03 18:53:27+08	2026-06-03 18:54:27+08
381	1	PROG001	318969221033889792	REWARD	ACCRUAL	1420.0000	1420.0000	2027-06-02 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060200011	{}	2026-06-02 10:40:12+08	2026-06-07 15:02:19.967168+08	2026-06-02 10:38:12+08	2026-06-02 10:39:12+08
382	1	PROG001	318969221033889792	REWARD	ACCRUAL	780.0000	780.0000	2027-06-01 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026060100012	{}	2026-06-01 14:15:33+08	2026-06-07 15:02:19.967168+08	2026-06-01 14:13:33+08	2026-06-01 14:14:33+08
383	1	PROG001	318969221033889792	REWARD	ACCRUAL	3999.0000	3999.0000	2027-05-30 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026053000013	{}	2026-05-30 09:22:18+08	2026-06-07 15:02:19.967168+08	2026-05-30 09:20:18+08	2026-05-30 09:21:18+08
384	1	PROG001	318969221033889792	REWARD	ACCRUAL	588.0000	588.0000	2027-05-25 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026052500014	{}	2026-05-25 11:45:09+08	2026-06-07 15:02:19.967168+08	2026-05-25 11:43:09+08	2026-05-25 11:44:09+08
385	1	PROG001	318969221033889792	REWARD	ACCRUAL	1650.0000	0.0000	2027-05-20 00:00:00+08	EXHAUSTED	\N	\N	\N	\N	\N	test-OM-TM2026052000015	{}	2026-05-20 16:30:44+08	2026-06-07 15:02:19.967168+08	2026-05-20 16:28:44+08	2026-05-20 16:29:44+08
386	1	PROG001	318969221033889792	REWARD	ACCRUAL	920.0000	0.0000	2027-05-15 00:00:00+08	EXHAUSTED	\N	\N	\N	\N	\N	test-OM-TM2026051500016	{}	2026-05-15 10:05:21+08	2026-06-07 15:02:19.967168+08	2026-05-15 10:03:21+08	2026-05-15 10:04:21+08
387	1	PROG001	318969221033889792	REWARD	ACCRUAL	2350.0000	2350.0000	2027-04-28 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026042800017	{}	2026-04-28 08:12:33+08	2026-06-07 15:02:19.967168+08	2026-04-28 08:10:33+08	2026-04-28 08:11:33+08
388	1	PROG001	318969221033889792	REWARD	ACCRUAL	430.0000	430.0000	2027-04-15 00:00:00+08	ACTIVE	\N	\N	\N	\N	\N	test-OM-TM2026041500018	{}	2026-04-15 20:33:18+08	2026-06-07 15:02:19.967168+08	2026-04-15 20:31:18+08	2026-04-15 20:32:18+08
\.


--
-- Data for Name: approval; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.approval (id, program_code, approval_type, target_type, target_id, applicant_id, approver_id, status, summary, rejection_reason, created_at, approved_at) FROM stdin;
\.


--
-- Data for Name: async_job; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.async_job (id, program_code, job_type, job_id, status, parameters, progress, result_report, error_message, created_by, trace_id, retry_count, started_at, finished_at, created_at) FROM stdin;
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (id, program_code, user_id, trace_id, request_id, client_ip, user_agent, action, entity_type, entity_id, risk_level, approval_id, before_summary, after_summary, details, prev_hash, current_hash, retention_until, created_at) FROM stdin;
\.


--
-- Data for Name: cascade_recalc_job; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cascade_recalc_job (id, program_code, async_job_id, job_id, reverse_event_id, member_id, status, cursor_event_time, affected_count, compensation_status, error_message, started_at, finished_at, created_at) FROM stdin;
\.


--
-- Data for Name: cascade_recalc_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cascade_recalc_log (id, program_code, reverse_event_id, member_id, affected_event_id, original_points, recalculated_points, points_diff, original_tier, recalculated_tier, recalc_order, created_at) FROM stdin;
\.


--
-- Data for Name: channel_adapter_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.channel_adapter_config (id, program_code, channel, auth_config, request_mapping, response_mapping, rate_limit_config, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: channel_credential; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.channel_credential (id, program_code, channel, credential_type, key_version, encrypted_value, kms_key_ref, status, created_by, approved_by, effective_at, expires_at, last_used_at, created_at) FROM stdin;
\.


--
-- Data for Name: channel_member_mapping; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.channel_member_mapping (program_code, channel, channel_member_id, member_id) FROM stdin;
\.


--
-- Data for Name: custom_entity_data; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.custom_entity_data (id, program_code, entity_name, entity_id, parent_entity_type, parent_id, attributes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: custom_entity_definition; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.custom_entity_definition (id, program_code, entity_name, relationship_type, related_core_entity, foreign_key_field, schema_json, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: event_inbox; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.event_inbox (id, program_code, source_channel, source_event_id, idempotency_key, payload_hash, payload, signature_verified, signature_detail, status, retry_count, error_message, trace_id, first_seen_at, processed_at, updated_at, max_retry, reject_reason, next_retry_at) FROM stdin;
\.


--
-- Data for Name: event_outbox; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.event_outbox (id, program_code, aggregate_type, aggregate_id, event_type, idempotency_key, payload, status, retry_count, next_retry_at, created_at, published_at) FROM stdin;
\.


--
-- Data for Name: export_task; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.export_task (id, program_code, async_job_id, export_type, exported_by, filter_conditions, field_scope, file_path, file_size, expires_at, watermark_info, approval_id, created_at, status, updated_at, error_message) FROM stdin;
\.


--
-- Data for Name: flow_definition; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.flow_definition (id, program_code, chain_name, chain_type, flow_graph, el_expression, status, version, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: flyway_schema_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.flyway_schema_history (installed_rank, version, description, type, script, checksum, installed_by, installed_on, execution_time, success) FROM stdin;
1	1	init schema	SQL	V1__init_schema.sql	1512296313	loyalty_dev	2026-05-28 20:12:50.808362	476	t
2	2	export task status and indexes	SQL	V2__export_task_status_and_indexes.sql	110601805	loyalty_dev	2026-05-28 20:12:51.321477	28	t
3	3	merchant app rls policy	SQL	V3__merchant_app_rls_policy.sql	-817116009	loyalty_dev	2026-05-28 20:12:51.362023	8	t
4	4	fix partitioned table unique constraints	SQL	V4__fix_partitioned_table_unique_constraints.sql	988272809	loyalty_dev	2026-05-28 20:12:51.376842	1	t
\.


--
-- Data for Name: member; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member (program_code, member_id, status, ext_attributes, created_at, updated_at, merged_to_member_id, schema_version, tier_code, name, gender, birthday) FROM stdin;
PROG001	318969221033889792	ENROLLED	{"name": "Wang Lei", "gender": "MALE", "mobile": "13812345678", "birthday": "1990-05-15", "pet_name": "旺财", "shoe_size": 42}	2026-05-30 12:29:48.621894+08	2026-05-30 12:29:48.621894+08	\N	\N	GOLD	\N	\N	\N
\.


--
-- Data for Name: member_account; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member_account (account_id, program_code, member_id, account_type, total_accrued, total_redeemed, version, created_at, updated_at, overdraft_limit, credit_limit, credit_used, total_expired, frozen_status) FROM stdin;
1	PROG001	318969221033889792	CONSUMPTION_POINTS	500.00	200.00	3	2026-05-30 12:38:35.831131+08	2026-05-30 12:47:45.869163+08	0.0000	0.0000	0.0000	0.0000	ACTIVE
219	PROG001	8821	REWARD	3500.00	2220.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	0.0000	0.0000	0.0000	ACTIVE
220	PROG001	8821	TIER	5200.00	0.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	0.0000	0.0000	0.0000	ACTIVE
221	PROG001	8821	CREDIT	0.00	0.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	5000.0000	0.0000	0.0000	ACTIVE
222	PROG001	8822	REWARD	1800.00	500.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	0.0000	0.0000	0.0000	ACTIVE
223	PROG001	8822	TIER	2500.00	0.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	0.0000	0.0000	0.0000	ACTIVE
224	PROG001	8822	CREDIT	0.00	0.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	3000.0000	500.0000	0.0000	ACTIVE
225	PROG001	8823	REWARD	15000.00	8000.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	0.0000	0.0000	0.0000	ACTIVE
226	PROG001	8823	TIER	120000.00	0.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	0.0000	0.0000	0.0000	ACTIVE
227	PROG001	8823	CREDIT	0.00	0.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	10000.0000	2000.0000	0.0000	ACTIVE
228	PROG001	8824	REWARD	300.00	100.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	0.0000	0.0000	0.0000	ACTIVE
229	PROG001	8824	TIER	800.00	0.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	0.0000	0.0000	0.0000	ACTIVE
230	PROG001	8825	REWARD	4500.00	3500.00	1	2026-06-07 08:52:51.120956+08	2026-06-07 08:52:51.120956+08	0.0000	0.0000	0.0000	0.0000	ACTIVE
\.


--
-- Data for Name: member_fifo_cursor; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member_fifo_cursor (program_code, member_id, account_type, last_tx_id, updated_at) FROM stdin;
\.


--
-- Data for Name: member_merge_task; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member_merge_task (id, program_code, main_member_id, duplicate_member_id, status, error_message, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: member_tier; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member_tier (program_code, member_id, current_tier, previous_tier, upgrade_source_event_id, effective_date, next_evaluation_date, updated_at) FROM stdin;
\.


--
-- Data for Name: member_unique_key; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.member_unique_key (program_code, key_combination, key_value, member_id, is_strong, is_verified, verified_at, created_at) FROM stdin;
PROG001	MOBILE	138****1234	318969221033889792	t	f	\N	2026-06-08 18:28:42.591492+08
PROG001	TMALL_OUID	tb_ouid_test	318969221033889792	t	f	\N	2026-06-08 18:28:42.591492+08
PROG001	WECHAT_OPENID	oxc_test_openid	318969221033889792	t	f	\N	2026-06-08 18:28:42.591492+08
\.


--
-- Data for Name: merchant_app; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.merchant_app (id, tenant_id, app_key, app_secret_hash, authorized_programs, api_permissions, qps_limit, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: negative_pending; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.negative_pending (id, program_code, member_id, account_type, pending_amount, source_reverse_event_id, status, settled_at, created_at) FROM stdin;
\.


--
-- Data for Name: notification; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notification (id, program_code, user_id, notification_type, title, detail, is_read, related_entity_type, related_entity_id, created_at) FROM stdin;
\.


--
-- Data for Name: notification_outbox; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notification_outbox (id, program_code, member_id, event_type, channel, recipient, template_code, payload, status, retry_count, max_retry, error_message, locked_by, locked_at, next_retry_at, sent_at, created_at) FROM stdin;
\.


--
-- Data for Name: point_type_definition; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.point_type_definition (id, program_code, type_code, type_name, is_redeemable, is_tier_calc, is_transferable, allow_negative, expiry_days, config_json, status, created_at, expiry_mode, expiry_value, is_visible, overdraft_limit, credit_limit) FROM stdin;
4	PROG001	REWARD	消费积分	t	f	t	f	365	{}	ACTIVE	2026-06-07 08:54:21.824949+08	CALENDAR_YEARS	1	t	0.0000	0.0000
5	PROG001	TIER	等级成长值	f	t	f	f	0	{}	ACTIVE	2026-06-07 08:54:21.824949+08	FIXED_DAYS	0	t	0.0000	0.0000
6	PROG001	CREDIT	授信积分	t	f	f	t	0	{}	ACTIVE	2026-06-07 08:54:21.824949+08	FIXED_DAYS	0	t	0.0000	5000.0000
\.


--
-- Data for Name: program; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.program (code, tenant_id, name, timezone, currency, config_json, status, created_by, updated_by, published_at, created_at, updated_at) FROM stdin;
PROG001	1	积分计划	Asia/Shanghai	CNY	{"pointsRatio": 100}	ACTIVE	\N	\N	\N	2026-05-28 20:41:20.618672+08	2026-05-28 20:41:20.618672+08
TEST002	1	TestProject	Asia/Shanghai	CNY	{"pointsTypes": []}	DRAFT	\N	\N	\N	2026-05-29 16:21:48.953951+08	2026-05-29 16:21:48.953951+08
TST001	1	Test	Asia/Shanghai	CNY	{"pointsTypes": []}	DRAFT	\N	\N	\N	2026-05-29 18:56:18.846822+08	2026-05-29 18:56:18.846822+08
TST003	1	TestProj	Asia/Shanghai	CNY	{"pointsTypes": []}	DRAFT	\N	\N	\N	2026-05-29 20:27:20.155367+08	2026-05-29 20:27:20.155367+08
TEST01	1	Test	Asia/Shanghai	CNY	{}	DRAFT	\N	\N	\N	2026-05-29 20:40:46.047165+08	2026-05-29 20:40:46.047165+08
TEST_PROG	1	Test Program	Asia/Shanghai	CNY	{}	DRAFT	\N	\N	\N	2026-05-29 23:13:19.211517+08	2026-05-29 23:13:19.211517+08
DEMO_PROG	1	Demo Program	Asia/Shanghai	CNY	{}	DRAFT	\N	\N	\N	2026-05-29 23:26:24.798468+08	2026-05-29 23:26:24.798468+08
CLUB-SH001	1	航空常旅客系统	Asia/Shanghai	CNY	{"uniqueKeys": [{"fields": ["phone"], "keyCombination": "phone"}], "pointsTypes": [{"code": "POINTS", "name": "积分", "allowOverdraft": false, "expiryStrategy": {"offset": 365, "baseType": "ACQUISITION_DATE", "anchorRule": "NONE", "offsetUnit": "DAY"}, "allowRedemption": true}], "configVersion": 1, "tierStructure": [{"sequence": 1, "tierCode": "SILVER", "tierName": "银卡", "evaluationMode": "REALTIME", "upgradeCriteria": {"threshold": 1000, "pointsType": "POINTS"}, "downgradeCriteria": {"period": "ROLLING_12_MONTHS", "threshold": 800}}], "channelConfigs": [{"channel": "TMALL"}]}	DRAFT	\N	\N	\N	2026-05-29 23:30:22.313063+08	2026-05-29 23:30:22.313063+08
CLUB-SH003	1	航空常旅客系统	Asia/Shanghai	CNY	{"uniqueKeys": [{"fields": ["phone"], "keyCombination": "phone"}], "pointsTypes": [{"code": "POINTS", "name": "积分", "allowOverdraft": false, "expiryStrategy": {"offset": 365, "baseType": "ACQUISITION_DATE", "anchorRule": "NONE", "offsetUnit": "DAY"}, "allowRedemption": true}], "configVersion": 1, "tierStructure": [{"sequence": 1, "tierCode": "SILVER", "tierName": "银卡", "evaluationMode": "REALTIME", "upgradeCriteria": {"threshold": 1000, "pointsType": "POINTS"}, "downgradeCriteria": {"period": "ROLLING_12_MONTHS", "threshold": 800}}], "channelConfigs": [{"channel": "TMALL"}]}	DRAFT	\N	\N	\N	2026-05-29 23:33:27.527154+08	2026-05-29 23:33:27.527154+08
TEST001	1	Test Program	Asia/Shanghai	CNY	{}	DRAFT	\N	\N	\N	2026-05-30 00:22:28.53384+08	2026-05-30 00:22:28.53384+08
\.


--
-- Data for Name: program_user_role; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.program_user_role (user_id, program_code, role_code, granted_by, created_at) FROM stdin;
1	PROG001	PROGRAM_ADMIN	\N	2026-05-28 20:41:20.623253+08
\.


--
-- Data for Name: redemption_allocation; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.redemption_allocation (id, program_code, redemption_transaction_id, accrual_transaction_id, allocated_amount, allocation_order, created_at) FROM stdin;
\.


--
-- Data for Name: reverse_event; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reverse_event (id, program_code, reverse_event_id, original_event_id, reverse_type, refund_amount, status, result_detail, created_at, completed_at) FROM stdin;
\.


--
-- Data for Name: rule_definition; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rule_definition (id, program_code, rule_code, rule_name, rule_type, rule_category, drl_content, version, status, metadata, created_at, updated_at) FROM stdin;
1	PROG001	E2E_TEST_RULE	未命名规则	DRL	purchase	package com.loyalty.platform.rules;\nimport com.loyalty.platform.rules.drl.MemberFact;\nimport com.loyalty.platform.rules.drl.EventFact;\nimport com.loyalty.platform.rules.action.ActionCollector;\n\nrule "custom_rule"\n  salience 100\n  agenda-group "purchase"\n  when\n    $event: EventFact(),\n    $member: MemberFact(memberId == $event.memberId),\n    eval(Arrays.asList("GOLD").contains($member.getTierCode())),\n    eval($event.getPayloadNumber("total_amount") >= ),\n    eval($event.getPayloadString("item_category") == ),\n    eval($event.getPayloadString("buyer_nick") == ),\n    eval($event.getPayloadString("source") == ),\n    eval($event.getPayloadString("channel") == ),\n    eval($member.getExtString("tier_code") == )\n  then\n    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "REWARD", new java.math.BigDecimal("10"), "custom_rule", null);\n    if ("GOLD".equals($member.getTierCode())) { collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "REWARD", _base.multiply(new java.math.BigDecimal("0.2")).setScale(0, java.math.RoundingMode.DOWN), "custom_rule_TIER", null); }\n    if ("PLATINUM".equals($member.getTierCode())) { collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "REWARD", _base.multiply(new java.math.BigDecimal("0.3")).setScale(0, java.math.RoundingMode.DOWN), "custom_rule_TIER", null); }\nend	\N	DRAFT	{"salience": 100, "effectiveTo": "", "tierFormulas": [{"key": "1", "tier": "GOLD", "pointType": "REWARD", "multiplier": 0.2}, {"key": "2", "tier": "PLATINUM", "pointType": "REWARD", "multiplier": 0.3}], "effectiveFrom": "", "extConditions": [{"op": "==", "key": "1781066594491", "type": "string", "field": "remark", "value": "", "entity": "ORDER"}, {"op": ">=", "key": "1781066595378", "type": "string", "field": "trade_time", "value": "", "entity": "ORDER", "format": "date-time"}, {"op": "==", "key": "1781066612267", "type": "string", "field": "source", "value": "", "entity": "BEHAVIOR"}, {"op": "==", "key": "1781066613850", "type": "string", "field": "channel", "value": "", "entity": "BEHAVIOR"}], "pointFormulas": [{"key": "1", "field": "order_amount", "pointType": "REWARD", "multiplier": 1}, {"key": "2", "field": "order_amount", "pointType": "TIER", "multiplier": 1}], "selectedEntity": "BEHAVIOR"}	2026-05-30 12:48:26.981437+08	2026-06-10 13:09:38.143247+08
4	PROG001	TEST_META	Metadata Test	DRL	purchase	rule test when eval(true) then System.out.println("ok"); end	1	DRAFT	\N	2026-06-10 12:30:27.407124+08	2026-06-10 12:30:27.407124+08
5	PROG001	TESTMETA	MetaTest	DRL	purchase	rule t when eval(true) then end	1	DRAFT	{"extConditions": [{"op": ">=", "field": "order_amount", "value": "200"}], "selectedEntity": "ORDER"}	2026-06-10 12:32:39.02522+08	2026-06-10 12:32:39.02522+08
6	PROG001	RULE_1781075042798	未命名规则	DRL	purchase	package com.loyalty.platform.rules;\nimport com.loyalty.platform.rules.drl.MemberFact;\nimport com.loyalty.platform.rules.drl.EventFact;\nimport com.loyalty.platform.rules.action.ActionCollector;\n\nrule "custom_rule"\n  salience 100\n  agenda-group "purchase"\n  when\n    $event: EventFact(),\n    $member: MemberFact(memberId == $event.memberId),\n    eval(Arrays.asList("GOLD").contains($member.getTierCode())),\n    eval($event.getPayloadString("remark") == ),\n    eval($event.getPayloadNumber("order_amount") >= )\n  then\n    java.math.BigDecimal _base = $event.getPayloadNumber("order_amount");\n    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "REWARD", _base.multiply(new java.math.BigDecimal("1")).setScale(0, java.math.RoundingMode.DOWN), "custom_rule", null);\n    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "TIER", _base.multiply(new java.math.BigDecimal("1")).setScale(0, java.math.RoundingMode.DOWN), "custom_rule", null);\n    if ("GOLD".equals($member.getTierCode())) { collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "REWARD", _base.multiply(new java.math.BigDecimal("0.2")).setScale(0, java.math.RoundingMode.DOWN), "custom_rule_TIER", null); }\n    if ("PLATINUM".equals($member.getTierCode())) { collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "REWARD", _base.multiply(new java.math.BigDecimal("0.3")).setScale(0, java.math.RoundingMode.DOWN), "custom_rule_TIER", null); }\nend	1	DRAFT	{"salience": 100, "effectiveTo": "", "tierFormulas": [{"key": "1", "tier": "GOLD", "pointType": "REWARD", "multiplier": 0.2}, {"key": "2", "tier": "PLATINUM", "pointType": "REWARD", "multiplier": 0.3}], "effectiveFrom": "", "extConditions": [{"op": "==", "key": "1781075013581", "type": "string", "field": "remark", "value": "", "entity": "ORDER"}, {"op": ">=", "key": "1781075015461", "type": "number", "field": "order_amount", "value": "", "entity": "ORDER"}], "pointFormulas": [{"key": "1", "field": "order_amount", "pointType": "REWARD", "multiplier": 1}, {"key": "2", "field": "order_amount", "pointType": "TIER", "multiplier": 1}], "selectedEntity": "ORDER"}	2026-06-10 15:04:03.219175+08	2026-06-10 15:04:03.219175+08
7	PROG001	RULE_1781075254069	未命名规则	DRL	campaign	package com.loyalty.platform.rules;\nimport com.loyalty.platform.rules.drl.MemberFact;\nimport com.loyalty.platform.rules.drl.EventFact;\nimport com.loyalty.platform.rules.action.ActionCollector;\n\nrule "custom_rule"\n  salience 100\n  agenda-group "campaign"\n  when\n    $event: EventFact(),\n    $member: MemberFact(memberId == $event.memberId),\n    eval(Arrays.asList("GOLD").contains($member.getTierCode())),\n    eval($event.getPayloadNumber("order_amount") >= ),\n    eval($event.getPayloadNumber("total_amount") >= ),\n    eval($event.getPayloadString("trade_status") == ),\n    eval($event.getPayloadString("item_category") == )\n  then\n    java.math.BigDecimal _base = $event.getPayloadNumber("order_amount");\n    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "REWARD", _base.multiply(new java.math.BigDecimal("1")).setScale(0, java.math.RoundingMode.DOWN), "custom_rule", null);\n    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "TIER", _base.multiply(new java.math.BigDecimal("1")).setScale(0, java.math.RoundingMode.DOWN), "custom_rule", null);\n    if ("GOLD".equals($member.getTierCode())) { collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "REWARD", _base.multiply(new java.math.BigDecimal("0.2")).setScale(0, java.math.RoundingMode.DOWN), "custom_rule_TIER", null); }\n    if ("PLATINUM".equals($member.getTierCode())) { collector.awardPoints($event.getProgramCode(), $event.getMemberId(), "REWARD", _base.multiply(new java.math.BigDecimal("0.3")).setScale(0, java.math.RoundingMode.DOWN), "custom_rule_TIER", null); }\nend	1	DRAFT	{"salience": 100, "effectiveTo": "", "tierFormulas": [{"key": "1", "tier": "GOLD", "pointType": "REWARD", "multiplier": 0.2}, {"key": "2", "tier": "PLATINUM", "pointType": "REWARD", "multiplier": 0.3}], "effectiveFrom": "", "extConditions": [{"op": ">=", "key": "1781075250037", "type": "number", "field": "order_amount", "value": "", "entity": "ORDER"}, {"op": ">=", "key": "1781075250735", "type": "number", "field": "total_amount", "value": "", "entity": "ORDER"}, {"op": "==", "key": "1781075251413", "type": "string", "field": "trade_status", "value": "", "entity": "ORDER"}, {"op": "==", "key": "1781075252228", "type": "string", "field": "item_category", "value": "", "entity": "ORDER"}], "pointFormulas": [{"key": "1", "field": "order_amount", "pointType": "REWARD", "multiplier": 1}, {"key": "2", "field": "order_amount", "pointType": "TIER", "multiplier": 1}], "selectedEntity": "ORDER"}	2026-06-10 15:07:34.113854+08	2026-06-10 15:07:34.113854+08
\.


--
-- Data for Name: rule_snapshot; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rule_snapshot (id, program_code, snapshot_version, kie_release_id, rule_ids, drl_bundle, created_by, approved_by, created_at, published_at) FROM stdin;
\.


--
-- Data for Name: schema_version; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schema_version (id, program_code, schema_type, schema_code, version, status, schema_json, impact_report, created_by, created_at, published_at) FROM stdin;
6	PROG001	BEHAVIOR	BEHAVIOR	1	PUBLISHED	{"type": "object", "title": "Behavior Event Payload", "required": ["member_id", "eventType"], "properties": {"remark": {"type": "string", "title": "Remark"}, "source": {"type": "string", "title": "Source"}, "channel": {"enum": ["TMALL", "JD", "DOUYIN", "WECHAT_MINI"], "type": "string", "title": "Channel"}, "eventType": {"enum": ["CHECK_IN", "SHARE", "REGISTER", "SIGN_IN"], "type": "string", "title": "Event Type"}, "member_id": {"type": "string", "title": "Member ID"}, "timestamp": {"type": "number", "title": "Unix Timestamp"}, "behavior_code": {"type": "string", "title": "Behavior Code"}, "behavior_name": {"type": "string", "title": "Behavior Name"}}, "description": "Behavior-related fields from channel webhooks (SIGN_IN/SHARE/REGISTER etc). Source: transaction_event columns + standardized payload"}	\N	\N	2026-06-09 18:20:26.679185+08	\N
4	PROG001	MEMBER	MEMBER	2	PUBLISHED	{"type": "object", "title": "Member Ext Attributes", "properties": {"age": {"type": "number", "title": "Age"}, "city": {"type": "string", "title": "City"}, "email": {"type": "string", "title": "Email"}, "level": {"type": "number", "title": "Level"}, "phone": {"type": "string", "title": "Phone"}, "gender": {"enum": ["MALE", "FEMALE", "UNKNOWN"], "type": "string", "title": "Gender"}, "status": {"enum": ["ENROLLED", "SUSPENDED", "MERGED", "DEACTIVATED"], "type": "string", "title": "Status"}, "birthday": {"type": "string", "title": "Birthday", "format": "date"}, "pet_name": {"type": "string", "title": "Pet Name"}, "shoe_size": {"type": "number", "title": "Shoe Size"}, "tier_code": {"enum": ["BASE", "SILVER", "GOLD", "PLATINUM"], "type": "string", "title": "Tier"}, "total_spent": {"type": "number", "title": "Total Spent"}, "total_orders": {"type": "number", "title": "Total Orders"}}}	\N	\N	2026-06-09 18:18:36.708976+08	\N
5	PROG001	ORDER	ORDER	2	PUBLISHED	{"type": "object", "title": "Order Event Payload", "required": ["member_id", "eventType"], "properties": {"items": {"type": "array", "items": {"type": "object", "properties": {"qty": {"type": "number", "title": "Quantity"}, "price": {"type": "number", "title": "Unit Price"}, "title": {"type": "string", "title": "Product Name"}, "sku_id": {"type": "string", "title": "SKU ID"}}}, "title": "Order Items"}, "remark": {"type": "string", "title": "Remark"}, "channel": {"enum": ["TMALL", "JD", "DOUYIN", "WECHAT_MINI"], "type": "string", "title": "Channel"}, "order_id": {"type": "string", "title": "Order ID"}, "pay_time": {"type": "string", "title": "Pay Time", "format": "date-time"}, "eventType": {"enum": ["ORDER_PAID"], "type": "string", "title": "Event Type", "format": null}, "member_id": {"type": "string", "title": "Member ID"}, "buyer_nick": {"type": "string", "title": "Buyer Nick"}, "item_count": {"type": "number", "title": "Item Count"}, "trade_time": {"type": "string", "title": "Trade Time", "format": "date-time"}, "order_amount": {"type": "number", "title": "Order Amount"}, "total_amount": {"type": "number", "title": "Total Amount"}, "trade_status": {"enum": ["WAIT_BUYER_PAY", "WAIT_SELLER_SEND_GOODS", "WAIT_BUYER_CONFIRM_GOODS", "TRADE_FINISHED", "TRADE_CLOSED"], "type": "string", "title": "Trade Status"}, "item_category": {"type": "string", "title": "Item Category"}}}	\N	\N	2026-06-09 18:20:17.645684+08	\N
\.


--
-- Data for Name: simulation_job; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.simulation_job (id, program_code, async_job_id, rule_id, simulation_type, status, parameters, result_report, started_at, finished_at, created_at) FROM stdin;
\.


--
-- Data for Name: system_enum; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_enum (id, program_code, enum_type, enum_code, enum_name, sort_order, is_active, created_at) FROM stdin;
1	SYSTEM	gender	MALE	男	1	t	2026-06-08 09:33:52.555203+08
2	SYSTEM	gender	FEMALE	女	2	t	2026-06-08 09:33:52.555203+08
3	SYSTEM	gender	UNKNOWN	未知	3	t	2026-06-08 09:33:52.555203+08
4	SYSTEM	member_status	ENROLLED	正常	1	t	2026-06-08 09:33:52.555203+08
5	SYSTEM	member_status	SUSPENDED	停用	2	t	2026-06-08 09:33:52.555203+08
6	SYSTEM	member_status	MERGED	已合并	3	t	2026-06-08 09:33:52.555203+08
7	SYSTEM	member_status	DEACTIVATED	已注销	4	t	2026-06-08 09:33:52.555203+08
8	SYSTEM	order_status	TRADE_NO_CREATE_PAY	未创建支付	1	t	2026-06-08 09:33:52.555203+08
9	SYSTEM	order_status	WAIT_BUYER_PAY	待付款	2	t	2026-06-08 09:33:52.555203+08
10	SYSTEM	order_status	WAIT_SELLER_SEND_GOODS	待发货	3	t	2026-06-08 09:33:52.555203+08
11	SYSTEM	order_status	WAIT_BUYER_CONFIRM_GOODS	待收货	4	t	2026-06-08 09:33:52.555203+08
12	SYSTEM	order_status	TRADE_FINISHED	交易成功	5	t	2026-06-08 09:33:52.555203+08
13	SYSTEM	order_status	TRADE_CLOSED	交易关闭	6	t	2026-06-08 09:33:52.555203+08
14	SYSTEM	order_status	TRADE_CLOSED_BY_TAOBAO	已关闭	7	t	2026-06-08 09:33:52.555203+08
15	SYSTEM	order_status	SELLER_CONSIGNED_PART	部分发货	8	t	2026-06-08 09:33:52.555203+08
16	SYSTEM	order_status	TRADE_BUYER_SIGNED	已签收	9	t	2026-06-08 09:33:52.555203+08
17	SYSTEM	order_status	PAY_PENDING	付款确认中	10	t	2026-06-08 09:33:52.555203+08
18	SYSTEM	order_status	WAIT_PRE_AUTH_CONFIRM	0元购合约中	11	t	2026-06-08 09:33:52.555203+08
19	SYSTEM	order_status	PAID_FORBID_CONSIGN	拼团中	12	t	2026-06-08 09:33:52.555203+08
20	SYSTEM	point_type	REWARD	消费积分	1	t	2026-06-08 09:33:52.555203+08
21	SYSTEM	point_type	TIER	等级成长值	2	t	2026-06-08 09:33:52.555203+08
22	SYSTEM	point_type	CREDIT	授信积分	3	t	2026-06-08 09:33:52.555203+08
23	SYSTEM	transaction_type	ACCRUAL	积分发放	1	t	2026-06-08 09:33:52.555203+08
24	SYSTEM	transaction_type	REDEMPTION	积分兑换	2	t	2026-06-08 09:33:52.555203+08
25	SYSTEM	transaction_type	EXPIRATION	积分过期	3	t	2026-06-08 09:33:52.555203+08
26	SYSTEM	transaction_type	REPAYMENT	透支还款	4	t	2026-06-08 09:33:52.555203+08
27	PROG001	channel	TMALL	Tmall	1	t	2026-06-09 14:02:04.875778+08
28	PROG001	channel	JD	JD	2	t	2026-06-09 14:02:04.875778+08
29	PROG001	channel	DOUYIN	Douyin	3	t	2026-06-09 14:02:04.875778+08
30	PROG001	channel	WECHAT_MINI	WeChat Mini	4	t	2026-06-09 14:02:04.875778+08
31	PROG001	event_type	ORDER_PAID	Order Paid	1	t	2026-06-09 14:02:19.310845+08
32	PROG001	event_type	CHECK_IN	Check In	2	t	2026-06-09 14:02:19.310845+08
33	PROG001	event_type	SHARE	Share	3	t	2026-06-09 14:02:19.310845+08
34	PROG001	event_type	REFUND	Refund	4	t	2026-06-09 14:02:19.310845+08
35	PROG001	event_type	REGISTER	Register	5	t	2026-06-09 14:02:19.310845+08
36	PROG001	event_type	SIGN_IN	Sign In	6	t	2026-06-09 14:19:28.121615+08
37	PROG001	event_type	ENROLLMENT	Enrollment	7	t	2026-06-09 14:19:28.121615+08
38	PROG001	event_type	ORDER_REFUND_FULL	Full Refund	8	t	2026-06-09 14:19:28.121615+08
39	PROG001	event_type	ORDER_REFUND_PARTIAL	Partial Refund	9	t	2026-06-09 14:19:28.121615+08
40	PROG001	event_type	REDEMPTION	Redemption	10	t	2026-06-09 14:19:28.121615+08
41	PROG001	event_type	REDEMPTION_CANCEL	Redemption Cancel	11	t	2026-06-09 14:19:28.121615+08
42	PROG001	event_type	ADJUSTMENT	Adjustment	12	t	2026-06-09 14:19:28.121615+08
43	PROG001	event_type	MERGE	Merge	13	t	2026-06-09 14:19:28.121615+08
44	PROG001	event_type	TIER_CHANGE	Tier Change	14	t	2026-06-09 14:19:28.121615+08
45	PROG001	transaction_type	ADJUSTMENT	Adjustment	5	t	2026-06-09 14:19:44.829522+08
46	PROG001	transaction_type	REFUND	Refund	6	t	2026-06-09 14:19:44.829522+08
47	PROG001	transaction_type	REVERSAL	Reversal	7	t	2026-06-09 14:19:44.829522+08
48	PROG001	transaction_type	OVERDRAFT	Overdraft	8	t	2026-06-09 14:19:44.829522+08
49	PROG001	transaction_type	CREDIT_DRAWDOWN	Credit Drawdown	9	t	2026-06-09 14:19:44.829522+08
50	PROG001	transaction_type	CREDIT_REPAY	Credit Repay	10	t	2026-06-09 14:19:44.829522+08
51	PROG001	transaction_type	CASCADE_DEDUCT	Cascade Deduct	11	t	2026-06-09 14:19:44.829522+08
52	PROG001	transaction_type	SETTLED	Settled	12	t	2026-06-09 14:19:44.829522+08
53	PROG001	transaction_type	COMPACTION	Compaction	13	t	2026-06-09 14:19:44.829522+08
\.


--
-- Data for Name: tenant; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant (id, name, status, plan_type, created_at, updated_at) FROM stdin;
1	测试商户	ACTIVE	PROFESSIONAL	2026-05-28 20:41:20.610179+08	2026-05-28 20:41:20.610179+08
\.


--
-- Data for Name: tenant_quota_usage; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_quota_usage (id, tenant_id, program_code, metric_date, transaction_count, member_count, rule_count, export_count, api_call_count, created_at) FROM stdin;
1	1	PROG001	2026-05-28	0	0	0	0	0	2026-05-29 01:00:30.195436+08
2	1	PROG001	2026-05-29	0	0	0	0	0	2026-05-30 01:00:30.128854+08
3	1	TEST002	2026-05-29	0	0	0	0	0	2026-05-30 01:00:30.232302+08
4	1	TST001	2026-05-29	0	0	0	0	0	2026-05-30 01:00:30.238513+08
5	1	TST003	2026-05-29	0	0	0	0	0	2026-05-30 01:00:30.244061+08
6	1	TEST01	2026-05-29	0	0	0	0	0	2026-05-30 01:00:30.260437+08
7	1	TEST_PROG	2026-05-29	0	0	0	0	0	2026-05-30 01:00:30.266179+08
8	1	DEMO_PROG	2026-05-29	0	0	0	0	0	2026-05-30 01:00:30.274478+08
9	1	CLUB-SH001	2026-05-29	0	0	0	0	0	2026-05-30 01:00:30.279013+08
10	1	CLUB-SH003	2026-05-29	0	0	0	0	0	2026-05-30 01:00:30.284005+08
11	1	TEST001	2026-05-29	0	0	0	0	0	2026-05-30 01:00:30.291682+08
12	1	PROG001	2026-05-30	0	1	1	0	0	2026-05-31 01:00:30.704937+08
13	1	TEST002	2026-05-30	0	0	0	0	0	2026-05-31 01:00:30.817719+08
14	1	TST001	2026-05-30	0	0	0	0	0	2026-05-31 01:00:30.839959+08
15	1	TST003	2026-05-30	0	0	0	0	0	2026-05-31 01:00:30.859082+08
16	1	TEST01	2026-05-30	0	0	0	0	0	2026-05-31 01:00:30.889163+08
17	1	TEST_PROG	2026-05-30	0	0	0	0	0	2026-05-31 01:00:30.929172+08
18	1	DEMO_PROG	2026-05-30	0	0	0	0	0	2026-05-31 01:00:30.959047+08
19	1	CLUB-SH001	2026-05-30	0	0	0	0	0	2026-05-31 01:00:30.98207+08
20	1	CLUB-SH003	2026-05-30	0	0	0	0	0	2026-05-31 01:00:31.017509+08
21	1	TEST001	2026-05-30	0	0	0	0	0	2026-05-31 01:00:31.047873+08
\.


--
-- Data for Name: tier_change_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tier_change_log (id, program_code, member_id, from_tier, to_tier, change_reason, event_id, changed_at) FROM stdin;
47	PROG001	318969221033889792	BASE	SILVER	ORDER_ACCRUAL	evt-up-01	2025-08-20 10:00:00+08
48	PROG001	318969221033889792	SILVER	GOLD	ORDER_ACCRUAL	evt-up-02	2026-02-15 12:00:00+08
\.


--
-- Data for Name: tier_definition; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tier_definition (program_code, tier_code, tier_name, sequence, upgrade_criteria, downgrade_criteria, created_at, updated_at, created_by) FROM stdin;
PROG001	BASE	普通会员	1	{"maxPoints": 10000, "minPoints": 0}	{}	2026-06-07 08:54:21.828581+08	2026-06-07 08:54:21.828581+08	\N
PROG001	SILVER	银卡会员	2	{"maxPoints": 50000, "minPoints": 10000}	{}	2026-06-07 08:54:21.828581+08	2026-06-07 08:54:21.828581+08	\N
PROG001	GOLD	金卡会员	3	{"maxPoints": 100000, "minPoints": 50000}	{}	2026-06-07 08:54:21.828581+08	2026-06-07 08:54:21.828581+08	\N
PROG001	PLATINUM	铂金会员	4	{"maxPoints": 99999999, "minPoints": 100000}	{}	2026-06-07 08:54:21.828581+08	2026-06-07 08:54:21.828581+08	\N
\.


--
-- Data for Name: transaction_event; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transaction_event (event_id, program_code, member_id, event_type, event_time, channel, source_event_id, idempotency_key, related_event_id, schema_version, rule_snapshot_version, processing_status, trace_id, error_message, ext_attributes, created_at, trade_time, pay_time, order_amount, trade_status) FROM stdin;
evt-OM-004	PROG001	318969221033889792	ORDER_PAID	2026-06-05 16:23:15+08	TMALL	\N	TM2026060500008	\N	\N	\N	SUCCEEDED	\N	\N	{"items": [{"qty": 2, "price": 1050.00, "title": "Wireless Headphones", "sku_id": "SPU004"}], "status": "TRADE_FINISHED", "total_amount": 2100.00}	2026-06-07 20:08:35.462507+08	2026-06-05 16:22:41+08	2026-06-05 16:23:15+08	2100.00	TRADE_FINISHED
evt-OM-005	PROG001	318969221033889792	ORDER_PAID	2026-05-30 09:22:55+08	TMALL	\N	TM2026053000013	\N	\N	\N	SUCCEEDED	\N	\N	{"items": [{"qty": 1, "price": 3999.00, "title": "Gaming Laptop", "sku_id": "SPU005"}], "status": "TRADE_FINISHED", "total_amount": 3999.00}	2026-06-07 20:08:35.462507+08	2026-05-30 09:22:18+08	2026-05-30 09:22:55+08	3999.00	TRADE_FINISHED
evt-OM-001	PROG001	318969221033889792	ORDER_PAID	2026-06-07 10:25:32+08	TMALL	\N	TM2026060700001	\N	\N	\N	SUCCEEDED	\N	\N	{"items": [{"qty": 2, "price": 199.00, "title": "Cotton T-Shirt", "sku_id": "SPU006"}, {"qty": 1, "price": 500.00, "title": "Denim Jeans", "sku_id": "SPU007"}], "status": "TRADE_FINISHED", "total_amount": 898.00}	2026-06-07 20:08:08.099351+08	2026-06-07 10:23:15+08	2026-06-07 10:25:32+08	699.00	TRADE_FINISHED
evt-OM-007	PROG001	318969221033889792	ORDER_REFUND_FULL	2026-06-07 12:00:00+08	TMALL	\N	TM2026060700003-REFUND	\N	\N	\N	SUCCEEDED	\N	\N	{"items": [{"qty": 1, "price": 349.00, "title": "Classic Sneakers", "sku_id": "SPU001"}], "status": "TRADE_CLOSED", "total_amount": 349.00, "refund_reason": "buyer request"}	2026-06-07 20:08:35.462507+08	2026-06-07 11:59:00+08	2026-06-07 11:59:30+08	-349.00	TRADE_CLOSED
evt-OM-006	PROG001	318969221033889792	ORDER_PAID	2026-06-07 14:29:11+08	TMALL	\N	TM2026060700003	\N	\N	\N	SUCCEEDED	\N	\N	{"items": [{"qty": 1, "price": 349.00, "title": "Classic Sneakers", "sku_id": "SPU001"}], "status": "TRADE_FINISHED", "total_amount": 349.00}	2026-06-07 20:08:35.462507+08	2026-06-07 14:28:11+08	2026-06-07 14:29:11+08	349.00	TRADE_FINISHED
evt-OM-002	PROG001	318969221033889792	ORDER_PAID	2026-06-07 11:06:10+08	TMALL	\N	TM2026060700002	\N	\N	\N	SUCCEEDED	\N	\N	{"items": [{"qty": 1, "price": 1280.00, "title": "Smart Watch Pro", "sku_id": "SPU002"}], "status": "TRADE_FINISHED", "total_amount": 1280.00}	2026-06-07 20:08:35.462507+08	2026-06-07 11:05:22+08	2026-06-07 11:06:10+08	1280.00	TRADE_FINISHED
evt-OM-003	PROG001	318969221033889792	ORDER_PAID	2026-06-06 09:15:58+08	TMALL	\N	TM2026060600004	\N	\N	\N	SUCCEEDED	\N	\N	{"items": [{"qty": 1, "price": 2560.00, "title": "4K Monitor 27\\"", "sku_id": "SPU003"}], "status": "TRADE_FINISHED", "total_amount": 2560.00}	2026-06-07 20:08:35.462507+08	2026-06-06 09:15:33+08	2026-06-06 09:15:58+08	2560.00	TRADE_FINISHED
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, password_hash, email, status, last_login_at, global_roles, created_at, updated_at) FROM stdin;
1	admin	$2a$12$9CTw1d5zRe5hcqFg1ekWxetr.umO.l7LIIAcSavhOdnRv2DOUg6c6	admin@test.com	ACTIVE	2026-05-30 10:33:38.545679+08	["ADMIN"]	2026-05-28 20:41:20.615318+08	2026-05-30 10:33:38.546686+08
\.


--
-- Name: account_transaction_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.account_transaction_id_seq', 390, true);


--
-- Name: approval_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.approval_id_seq', 1, false);


--
-- Name: async_job_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.async_job_id_seq', 1, false);


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 1, false);


--
-- Name: cascade_recalc_job_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cascade_recalc_job_id_seq', 50, true);


--
-- Name: cascade_recalc_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cascade_recalc_log_id_seq', 25, true);


--
-- Name: channel_adapter_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.channel_adapter_config_id_seq', 1, false);


--
-- Name: channel_credential_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.channel_credential_id_seq', 1, false);


--
-- Name: custom_entity_data_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.custom_entity_data_id_seq', 1, false);


--
-- Name: custom_entity_definition_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.custom_entity_definition_id_seq', 1, false);


--
-- Name: event_inbox_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.event_inbox_id_seq', 421, true);


--
-- Name: event_outbox_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.event_outbox_id_seq', 1, false);


--
-- Name: export_task_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.export_task_id_seq', 1, false);


--
-- Name: flow_definition_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.flow_definition_id_seq', 1, false);


--
-- Name: member_account_account_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.member_account_account_id_seq', 242, true);


--
-- Name: member_merge_task_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.member_merge_task_id_seq', 1, false);


--
-- Name: merchant_app_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.merchant_app_id_seq', 1, false);


--
-- Name: negative_pending_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.negative_pending_id_seq', 1, false);


--
-- Name: notification_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notification_id_seq', 1, false);


--
-- Name: notification_outbox_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notification_outbox_id_seq', 1, false);


--
-- Name: point_type_definition_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.point_type_definition_id_seq', 6, true);


--
-- Name: redemption_allocation_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.redemption_allocation_id_seq', 104, true);


--
-- Name: reverse_event_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.reverse_event_id_seq', 1, false);


--
-- Name: rule_definition_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rule_definition_id_seq', 7, true);


--
-- Name: rule_snapshot_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rule_snapshot_id_seq', 1, false);


--
-- Name: schema_version_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.schema_version_id_seq', 6, true);


--
-- Name: simulation_job_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.simulation_job_id_seq', 1, false);


--
-- Name: system_enum_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.system_enum_id_seq', 53, true);


--
-- Name: tenant_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tenant_id_seq', 1, false);


--
-- Name: tenant_quota_usage_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tenant_quota_usage_id_seq', 21, true);


--
-- Name: tier_change_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tier_change_log_id_seq', 52, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 1, false);


--
-- Name: account_transaction account_transaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_transaction
    ADD CONSTRAINT account_transaction_pkey PRIMARY KEY (id);


--
-- Name: approval approval_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval
    ADD CONSTRAINT approval_pkey PRIMARY KEY (id);


--
-- Name: async_job async_job_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.async_job
    ADD CONSTRAINT async_job_pkey PRIMARY KEY (id);


--
-- Name: async_job async_job_program_code_job_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.async_job
    ADD CONSTRAINT async_job_program_code_job_id_key UNIQUE (program_code, job_id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: cascade_recalc_job cascade_recalc_job_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cascade_recalc_job
    ADD CONSTRAINT cascade_recalc_job_pkey PRIMARY KEY (id);


--
-- Name: cascade_recalc_job cascade_recalc_job_program_code_job_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cascade_recalc_job
    ADD CONSTRAINT cascade_recalc_job_program_code_job_id_key UNIQUE (program_code, job_id);


--
-- Name: cascade_recalc_log cascade_recalc_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cascade_recalc_log
    ADD CONSTRAINT cascade_recalc_log_pkey PRIMARY KEY (id);


--
-- Name: channel_adapter_config channel_adapter_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_adapter_config
    ADD CONSTRAINT channel_adapter_config_pkey PRIMARY KEY (id);


--
-- Name: channel_adapter_config channel_adapter_config_program_code_channel_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_adapter_config
    ADD CONSTRAINT channel_adapter_config_program_code_channel_key UNIQUE (program_code, channel);


--
-- Name: channel_credential channel_credential_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_credential
    ADD CONSTRAINT channel_credential_pkey PRIMARY KEY (id);


--
-- Name: channel_member_mapping channel_member_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_member_mapping
    ADD CONSTRAINT channel_member_mapping_pkey PRIMARY KEY (program_code, channel, channel_member_id);


--
-- Name: custom_entity_data custom_entity_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_entity_data
    ADD CONSTRAINT custom_entity_data_pkey PRIMARY KEY (id);


--
-- Name: custom_entity_definition custom_entity_definition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_entity_definition
    ADD CONSTRAINT custom_entity_definition_pkey PRIMARY KEY (id);


--
-- Name: custom_entity_definition custom_entity_definition_program_code_entity_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_entity_definition
    ADD CONSTRAINT custom_entity_definition_program_code_entity_name_key UNIQUE (program_code, entity_name);


--
-- Name: event_inbox event_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_inbox
    ADD CONSTRAINT event_inbox_pkey PRIMARY KEY (id);


--
-- Name: event_inbox event_inbox_program_code_source_channel_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_inbox
    ADD CONSTRAINT event_inbox_program_code_source_channel_idempotency_key_key UNIQUE (program_code, source_channel, idempotency_key);


--
-- Name: event_outbox event_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_outbox
    ADD CONSTRAINT event_outbox_pkey PRIMARY KEY (id);


--
-- Name: event_outbox event_outbox_program_code_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_outbox
    ADD CONSTRAINT event_outbox_program_code_idempotency_key_key UNIQUE (program_code, idempotency_key);


--
-- Name: export_task export_task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_task
    ADD CONSTRAINT export_task_pkey PRIMARY KEY (id);


--
-- Name: flow_definition flow_definition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_definition
    ADD CONSTRAINT flow_definition_pkey PRIMARY KEY (id);


--
-- Name: flow_definition flow_definition_program_code_chain_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flow_definition
    ADD CONSTRAINT flow_definition_program_code_chain_name_key UNIQUE (program_code, chain_name);


--
-- Name: flyway_schema_history flyway_schema_history_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flyway_schema_history
    ADD CONSTRAINT flyway_schema_history_pk PRIMARY KEY (installed_rank);


--
-- Name: member_account member_account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_account
    ADD CONSTRAINT member_account_pkey PRIMARY KEY (account_id);


--
-- Name: member_account member_account_program_code_member_id_account_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_account
    ADD CONSTRAINT member_account_program_code_member_id_account_type_key UNIQUE (program_code, member_id, account_type);


--
-- Name: member_fifo_cursor member_fifo_cursor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_fifo_cursor
    ADD CONSTRAINT member_fifo_cursor_pkey PRIMARY KEY (program_code, member_id, account_type);


--
-- Name: member_merge_task member_merge_task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_merge_task
    ADD CONSTRAINT member_merge_task_pkey PRIMARY KEY (id);


--
-- Name: member member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_pkey PRIMARY KEY (program_code, member_id);


--
-- Name: member_tier member_tier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_tier
    ADD CONSTRAINT member_tier_pkey PRIMARY KEY (program_code, member_id);


--
-- Name: member_unique_key member_unique_key_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_unique_key
    ADD CONSTRAINT member_unique_key_pkey PRIMARY KEY (program_code, key_combination, key_value);


--
-- Name: merchant_app merchant_app_app_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_app
    ADD CONSTRAINT merchant_app_app_key_key UNIQUE (app_key);


--
-- Name: merchant_app merchant_app_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_app
    ADD CONSTRAINT merchant_app_pkey PRIMARY KEY (id);


--
-- Name: negative_pending negative_pending_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.negative_pending
    ADD CONSTRAINT negative_pending_pkey PRIMARY KEY (id);


--
-- Name: notification_outbox notification_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_outbox
    ADD CONSTRAINT notification_outbox_pkey PRIMARY KEY (id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);


--
-- Name: point_type_definition point_type_definition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.point_type_definition
    ADD CONSTRAINT point_type_definition_pkey PRIMARY KEY (id);


--
-- Name: point_type_definition point_type_definition_program_code_type_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.point_type_definition
    ADD CONSTRAINT point_type_definition_program_code_type_code_key UNIQUE (program_code, type_code);


--
-- Name: program program_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program
    ADD CONSTRAINT program_pkey PRIMARY KEY (code);


--
-- Name: program_user_role program_user_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_user_role
    ADD CONSTRAINT program_user_role_pkey PRIMARY KEY (user_id, program_code, role_code);


--
-- Name: redemption_allocation redemption_allocation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemption_allocation
    ADD CONSTRAINT redemption_allocation_pkey PRIMARY KEY (id);


--
-- Name: redemption_allocation redemption_allocation_program_code_redemption_transaction_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemption_allocation
    ADD CONSTRAINT redemption_allocation_program_code_redemption_transaction_i_key UNIQUE (program_code, redemption_transaction_id, accrual_transaction_id);


--
-- Name: reverse_event reverse_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reverse_event
    ADD CONSTRAINT reverse_event_pkey PRIMARY KEY (id);


--
-- Name: reverse_event reverse_event_program_code_reverse_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reverse_event
    ADD CONSTRAINT reverse_event_program_code_reverse_event_id_key UNIQUE (program_code, reverse_event_id);


--
-- Name: rule_definition rule_definition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definition
    ADD CONSTRAINT rule_definition_pkey PRIMARY KEY (id);


--
-- Name: rule_definition rule_definition_program_code_rule_code_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definition
    ADD CONSTRAINT rule_definition_program_code_rule_code_version_key UNIQUE (program_code, rule_code, version);


--
-- Name: rule_snapshot rule_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_snapshot
    ADD CONSTRAINT rule_snapshot_pkey PRIMARY KEY (id);


--
-- Name: rule_snapshot rule_snapshot_program_code_snapshot_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_snapshot
    ADD CONSTRAINT rule_snapshot_program_code_snapshot_version_key UNIQUE (program_code, snapshot_version);


--
-- Name: schema_version schema_version_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_version
    ADD CONSTRAINT schema_version_pkey PRIMARY KEY (id);


--
-- Name: schema_version schema_version_program_code_schema_type_schema_code_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_version
    ADD CONSTRAINT schema_version_program_code_schema_type_schema_code_version_key UNIQUE (program_code, schema_type, schema_code, version);


--
-- Name: simulation_job simulation_job_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.simulation_job
    ADD CONSTRAINT simulation_job_pkey PRIMARY KEY (id);


--
-- Name: system_enum system_enum_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_enum
    ADD CONSTRAINT system_enum_pkey PRIMARY KEY (id);


--
-- Name: system_enum system_enum_program_code_enum_type_enum_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_enum
    ADD CONSTRAINT system_enum_program_code_enum_type_enum_code_key UNIQUE (program_code, enum_type, enum_code);


--
-- Name: tenant tenant_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant
    ADD CONSTRAINT tenant_pkey PRIMARY KEY (id);


--
-- Name: tenant_quota_usage tenant_quota_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_quota_usage
    ADD CONSTRAINT tenant_quota_usage_pkey PRIMARY KEY (id);


--
-- Name: tenant_quota_usage tenant_quota_usage_tenant_id_program_code_metric_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_quota_usage
    ADD CONSTRAINT tenant_quota_usage_tenant_id_program_code_metric_date_key UNIQUE (tenant_id, program_code, metric_date);


--
-- Name: tier_change_log tier_change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_change_log
    ADD CONSTRAINT tier_change_log_pkey PRIMARY KEY (id);


--
-- Name: tier_definition tier_definition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_definition
    ADD CONSTRAINT tier_definition_pkey PRIMARY KEY (program_code, tier_code);


--
-- Name: transaction_event transaction_event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transaction_event
    ADD CONSTRAINT transaction_event_pkey PRIMARY KEY (event_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: flyway_schema_history_s_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX flyway_schema_history_s_idx ON public.flyway_schema_history USING btree (success);


--
-- Name: idx_approval_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_pending ON public.approval USING btree (program_code, status, approval_type);


--
-- Name: idx_async_job_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_async_job_status ON public.async_job USING btree (program_code, job_type, status);


--
-- Name: idx_at_active_accrual; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_at_active_accrual ON public.account_transaction USING btree (account_id, transaction_type, status, expires_at) WHERE (((transaction_type)::text = 'ACCRUAL'::text) AND ((status)::text = 'ACTIVE'::text));


--
-- Name: idx_at_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_at_event ON public.account_transaction USING btree (program_code, reference_event_id, transaction_type);


--
-- Name: idx_at_member_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_at_member_expires ON public.account_transaction USING btree (program_code, member_id, account_type, status, expires_at);


--
-- Name: idx_at_member_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_at_member_type_created ON public.account_transaction USING btree (program_code, member_id, transaction_type, created_at);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_log USING btree (program_code, action, created_at);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON public.audit_log USING btree (program_code, entity_type, entity_id);


--
-- Name: idx_crl_reverse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crl_reverse ON public.cascade_recalc_log USING btree (program_code, reverse_event_id);


--
-- Name: idx_custom_entity_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_custom_entity_parent ON public.custom_entity_data USING btree (program_code, entity_name, parent_id);


--
-- Name: idx_export_task_program_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_task_program_status ON public.export_task USING btree (program_code, status);


--
-- Name: idx_export_task_program_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_export_task_program_type ON public.export_task USING btree (program_code, export_type);


--
-- Name: idx_fd_program; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fd_program ON public.flow_definition USING btree (program_code, chain_type);


--
-- Name: idx_member_mobile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_mobile ON public.member USING btree (program_code, ((ext_attributes ->> 'mobile'::text))) WHERE ((ext_attributes ->> 'mobile'::text) IS NOT NULL);


--
-- Name: idx_mmt_main_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mmt_main_member ON public.member_merge_task USING btree (program_code, main_member_id);


--
-- Name: idx_mmt_program_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mmt_program_status ON public.member_merge_task USING btree (program_code, status);


--
-- Name: idx_notification_program_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_program_read ON public.notification USING btree (program_code, is_read);


--
-- Name: idx_notification_program_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_program_user ON public.notification USING btree (program_code, user_id);


--
-- Name: idx_notification_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_unread ON public.notification USING btree (program_code, user_id, is_read, created_at);


--
-- Name: idx_np_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_np_member ON public.negative_pending USING btree (program_code, member_id, account_type, status);


--
-- Name: idx_outbox_next_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_next_retry ON public.notification_outbox USING btree (next_retry_at) WHERE ((status)::text = ANY ((ARRAY['RETRY'::character varying, 'PENDING'::character varying])::text[]));


--
-- Name: idx_outbox_status_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_status_channel ON public.notification_outbox USING btree (program_code, status, channel);


--
-- Name: idx_rule_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_code ON public.rule_definition USING btree (program_code, rule_code);


--
-- Name: idx_rule_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rule_status ON public.rule_definition USING btree (program_code, status);


--
-- Name: idx_sim_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sim_status ON public.simulation_job USING btree (program_code, status);


--
-- Name: idx_tcl_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tcl_member ON public.tier_change_log USING btree (program_code, member_id);


--
-- Name: idx_txn_member_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_txn_member_time ON public.transaction_event USING btree (program_code, member_id, event_time);


--
-- Name: idx_txn_related; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_txn_related ON public.transaction_event USING btree (program_code, related_event_id);


--
-- Name: idx_txn_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_txn_status ON public.transaction_event USING btree (program_code, processing_status);


--
-- Name: idx_txn_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_txn_type_status ON public.transaction_event USING btree (program_code, event_type, processing_status);


--
-- Name: uk_at_idempotent_operation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uk_at_idempotent_operation ON public.account_transaction USING btree (program_code, operation_key) WHERE (operation_key IS NOT NULL);


--
-- Name: uk_txn_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uk_txn_idempotency ON public.transaction_event USING btree (program_code, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: account_transaction account_transaction_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_transaction
    ADD CONSTRAINT account_transaction_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.member_account(account_id);


--
-- Name: cascade_recalc_job cascade_recalc_job_async_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cascade_recalc_job
    ADD CONSTRAINT cascade_recalc_job_async_job_id_fkey FOREIGN KEY (async_job_id) REFERENCES public.async_job(id);


--
-- Name: channel_adapter_config channel_adapter_config_program_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_adapter_config
    ADD CONSTRAINT channel_adapter_config_program_code_fkey FOREIGN KEY (program_code) REFERENCES public.program(code);


--
-- Name: custom_entity_definition custom_entity_definition_program_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_entity_definition
    ADD CONSTRAINT custom_entity_definition_program_code_fkey FOREIGN KEY (program_code) REFERENCES public.program(code);


--
-- Name: export_task export_task_approval_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_task
    ADD CONSTRAINT export_task_approval_id_fkey FOREIGN KEY (approval_id) REFERENCES public.approval(id);


--
-- Name: export_task export_task_async_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.export_task
    ADD CONSTRAINT export_task_async_job_id_fkey FOREIGN KEY (async_job_id) REFERENCES public.async_job(id);


--
-- Name: member_account member_account_program_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_account
    ADD CONSTRAINT member_account_program_code_fkey FOREIGN KEY (program_code) REFERENCES public.program(code);


--
-- Name: member member_program_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member
    ADD CONSTRAINT member_program_code_fkey FOREIGN KEY (program_code) REFERENCES public.program(code);


--
-- Name: merchant_app merchant_app_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.merchant_app
    ADD CONSTRAINT merchant_app_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: program program_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program
    ADD CONSTRAINT program_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: program_user_role program_user_role_program_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_user_role
    ADD CONSTRAINT program_user_role_program_code_fkey FOREIGN KEY (program_code) REFERENCES public.program(code);


--
-- Name: program_user_role program_user_role_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.program_user_role
    ADD CONSTRAINT program_user_role_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: redemption_allocation redemption_allocation_accrual_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemption_allocation
    ADD CONSTRAINT redemption_allocation_accrual_transaction_id_fkey FOREIGN KEY (accrual_transaction_id) REFERENCES public.account_transaction(id);


--
-- Name: redemption_allocation redemption_allocation_redemption_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.redemption_allocation
    ADD CONSTRAINT redemption_allocation_redemption_transaction_id_fkey FOREIGN KEY (redemption_transaction_id) REFERENCES public.account_transaction(id);


--
-- Name: rule_definition rule_definition_program_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rule_definition
    ADD CONSTRAINT rule_definition_program_code_fkey FOREIGN KEY (program_code) REFERENCES public.program(code);


--
-- Name: schema_version schema_version_program_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_version
    ADD CONSTRAINT schema_version_program_code_fkey FOREIGN KEY (program_code) REFERENCES public.program(code);


--
-- Name: simulation_job simulation_job_async_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.simulation_job
    ADD CONSTRAINT simulation_job_async_job_id_fkey FOREIGN KEY (async_job_id) REFERENCES public.async_job(id);


--
-- Name: simulation_job simulation_job_program_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.simulation_job
    ADD CONSTRAINT simulation_job_program_code_fkey FOREIGN KEY (program_code) REFERENCES public.program(code);


--
-- Name: simulation_job simulation_job_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.simulation_job
    ADD CONSTRAINT simulation_job_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.rule_definition(id);


--
-- Name: tenant_quota_usage tenant_quota_usage_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_quota_usage
    ADD CONSTRAINT tenant_quota_usage_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenant(id);


--
-- Name: tier_definition tier_definition_program_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tier_definition
    ADD CONSTRAINT tier_definition_program_code_fkey FOREIGN KEY (program_code) REFERENCES public.program(code);


--
-- Name: account_transaction; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_transaction ENABLE ROW LEVEL SECURITY;

--
-- Name: approval; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approval ENABLE ROW LEVEL SECURITY;

--
-- Name: async_job; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.async_job ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: cascade_recalc_job; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cascade_recalc_job ENABLE ROW LEVEL SECURITY;

--
-- Name: cascade_recalc_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cascade_recalc_log ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_adapter_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_adapter_config ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_credential; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_credential ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_member_mapping; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_member_mapping ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_entity_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_entity_data ENABLE ROW LEVEL SECURITY;

--
-- Name: custom_entity_definition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.custom_entity_definition ENABLE ROW LEVEL SECURITY;

--
-- Name: event_inbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_inbox ENABLE ROW LEVEL SECURITY;

--
-- Name: event_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: export_task; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.export_task ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_definition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.flow_definition ENABLE ROW LEVEL SECURITY;

--
-- Name: member; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member ENABLE ROW LEVEL SECURITY;

--
-- Name: member_account; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_account ENABLE ROW LEVEL SECURITY;

--
-- Name: member_merge_task; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_merge_task ENABLE ROW LEVEL SECURITY;

--
-- Name: member_tier; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_tier ENABLE ROW LEVEL SECURITY;

--
-- Name: member_unique_key; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_unique_key ENABLE ROW LEVEL SECURITY;

--
-- Name: merchant_app; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.merchant_app ENABLE ROW LEVEL SECURITY;

--
-- Name: negative_pending; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.negative_pending ENABLE ROW LEVEL SECURITY;

--
-- Name: notification; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;

--
-- Name: program; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program ENABLE ROW LEVEL SECURITY;

--
-- Name: program_user_role; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.program_user_role ENABLE ROW LEVEL SECURITY;

--
-- Name: redemption_allocation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.redemption_allocation ENABLE ROW LEVEL SECURITY;

--
-- Name: reverse_event; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reverse_event ENABLE ROW LEVEL SECURITY;

--
-- Name: rule_definition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rule_definition ENABLE ROW LEVEL SECURITY;

--
-- Name: rule_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rule_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: simulation_job; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.simulation_job ENABLE ROW LEVEL SECURITY;

--
-- Name: account_transaction tenant_isolation_account_transaction; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_account_transaction ON public.account_transaction TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: channel_adapter_config tenant_isolation_channel_adapter_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_channel_adapter_config ON public.channel_adapter_config TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: event_inbox tenant_isolation_event_inbox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_event_inbox ON public.event_inbox TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: flow_definition tenant_isolation_flow_definition; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_flow_definition ON public.flow_definition TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: member tenant_isolation_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_member ON public.member TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: member_account tenant_isolation_member_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_member_account ON public.member_account TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: member_merge_task tenant_isolation_member_merge_task; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_member_merge_task ON public.member_merge_task TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: member_tier tenant_isolation_member_tier; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_member_tier ON public.member_tier TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: member_unique_key tenant_isolation_member_unique_key; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_member_unique_key ON public.member_unique_key TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: redemption_allocation tenant_isolation_redemption_allocation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_redemption_allocation ON public.redemption_allocation TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: rule_definition tenant_isolation_rule_definition; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_rule_definition ON public.rule_definition TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: rule_snapshot tenant_isolation_rule_snapshot; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_rule_snapshot ON public.rule_snapshot TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: tier_change_log tenant_isolation_tier_change_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_tier_change_log ON public.tier_change_log TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: transaction_event tenant_isolation_transaction_event; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_transaction_event ON public.transaction_event TO loyalty_app USING (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text))) WITH CHECK (((program_code)::text = COALESCE(NULLIF(current_setting('app.current_program_code'::text, true), ''::text), (program_code)::text)));


--
-- Name: tenant_quota_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_quota_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: tier_change_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tier_change_log ENABLE ROW LEVEL SECURITY;

--
-- Name: tier_definition; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tier_definition ENABLE ROW LEVEL SECURITY;

--
-- Name: transaction_event; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transaction_event ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict Kt8UIDbwxcPipCVJLg367YObgLDkPvBbODR3YfVRrEBqgg5IbmTT9b2QfdTeoEn

