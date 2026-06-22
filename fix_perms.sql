ALTER TABLE llm_config OWNER TO loyalty_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON llm_config TO loyalty_app;
GRANT USAGE, SELECT ON SEQUENCE llm_config_id_seq TO loyalty_app;
