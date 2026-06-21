import MysqlLogo from '@chartdb/assets/mysql_logo.png';
import MysqlLogoDark from '@chartdb/assets/mysql_logo_dark.png';
import PostgresqlLogo from '@chartdb/assets/postgresql_logo.png';
import PostgresqlLogoDark from '@chartdb/assets/postgresql_logo_dark.png';
import MariaDBLogo from '@chartdb/assets/mariadb_logo.png';
import MariaDBLogoDark from '@chartdb/assets/mariadb_logo_dark.png';
import SqliteLogo from '@chartdb/assets/sqlite_logo.png';
import SqliteLogoDark from '@chartdb/assets/sqlite_logo_dark.png';
import SqlServerLogo from '@chartdb/assets/sql_server_logo.png';
import SqlServerLogoDark from '@chartdb/assets/sql_server_logo_dark.png';
import MysqlLogo2 from '@chartdb/assets/mysql_logo_2.png';
import PostgresqlLogo2 from '@chartdb/assets/postgresql_logo_2.png';
import MariaDBLogo2 from '@chartdb/assets/mariadb_logo_2.png';
import SqliteLogo2 from '@chartdb/assets/sqlite_logo_2.png';
import SqlServerLogo2 from '@chartdb/assets/sql_server_logo_2.png';
import GeneralDBLogo2 from '@chartdb/assets/general_db_logo_2.png';
import ClickhouseLogo from '@chartdb/assets/clickhouse_logo.png';
import ClickhouseLogoDark from '@chartdb/assets/clickhouse_logo_dark.png';
import ClickhouseLogo2 from '@chartdb/assets/clickhouse_logo_2.png';
import CockroachDBLogo from '@chartdb/assets/cockroachdb_logo.png';
import CockroachDBLogoDark from '@chartdb/assets/cockroachdb_logo_dark.png';
import CockroachDBLogo2 from '@chartdb/assets/cockroachdb_logo_2.png';
import OracleLogo from '@chartdb/assets/oracle_logo.png';
import OracleLogoDark from '@chartdb/assets/oracle_logo_dark.png';
import OracleLogo2 from '@chartdb/assets/oracle_logo_2.png';
import { DatabaseType } from './domain/database-type';
import type { EffectiveTheme } from './types';

export const databaseTypeToLabelMap: Record<DatabaseType, string> = {
    [DatabaseType.GENERIC]: 'Generic',
    [DatabaseType.POSTGRESQL]: 'PostgreSQL',
    [DatabaseType.MYSQL]: 'MySQL',
    [DatabaseType.SQL_SERVER]: 'SQL Server',
    [DatabaseType.MARIADB]: 'MariaDB',
    [DatabaseType.SQLITE]: 'SQLite',
    [DatabaseType.CLICKHOUSE]: 'ClickHouse',
    [DatabaseType.COCKROACHDB]: 'CockroachDB',
    [DatabaseType.ORACLE]: 'Oracle',
};

export const databaseLogoMap: Record<DatabaseType, string> = {
    [DatabaseType.MYSQL]: MysqlLogo,
    [DatabaseType.POSTGRESQL]: PostgresqlLogo,
    [DatabaseType.MARIADB]: MariaDBLogo,
    [DatabaseType.SQLITE]: SqliteLogo,
    [DatabaseType.SQL_SERVER]: SqlServerLogo,
    [DatabaseType.CLICKHOUSE]: ClickhouseLogo,
    [DatabaseType.COCKROACHDB]: CockroachDBLogo,
    [DatabaseType.ORACLE]: OracleLogo,
    [DatabaseType.GENERIC]: '',
};

export const databaseDarkLogoMap: Record<DatabaseType, string> = {
    [DatabaseType.MYSQL]: MysqlLogoDark,
    [DatabaseType.POSTGRESQL]: PostgresqlLogoDark,
    [DatabaseType.MARIADB]: MariaDBLogoDark,
    [DatabaseType.SQLITE]: SqliteLogoDark,
    [DatabaseType.SQL_SERVER]: SqlServerLogoDark,
    [DatabaseType.CLICKHOUSE]: ClickhouseLogoDark,
    [DatabaseType.COCKROACHDB]: CockroachDBLogoDark,
    [DatabaseType.ORACLE]: OracleLogoDark,
    [DatabaseType.GENERIC]: '',
};

export const getDatabaseLogo = (
    databaseType: DatabaseType,
    theme: EffectiveTheme
) =>
    theme === 'dark'
        ? databaseDarkLogoMap[databaseType]
        : databaseLogoMap[databaseType];

export const databaseSecondaryLogoMap: Record<DatabaseType, string> = {
    [DatabaseType.MYSQL]: MysqlLogo2,
    [DatabaseType.POSTGRESQL]: PostgresqlLogo2,
    [DatabaseType.MARIADB]: MariaDBLogo2,
    [DatabaseType.SQLITE]: SqliteLogo2,
    [DatabaseType.SQL_SERVER]: SqlServerLogo2,
    [DatabaseType.CLICKHOUSE]: ClickhouseLogo2,
    [DatabaseType.COCKROACHDB]: CockroachDBLogo2,
    [DatabaseType.ORACLE]: OracleLogo2,
    [DatabaseType.GENERIC]: GeneralDBLogo2,
};
