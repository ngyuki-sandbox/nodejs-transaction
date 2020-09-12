import mysql from 'mariadb'
import { Conext } from './conext'

const dbConfig: mysql.PoolConfig = {
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || ''),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
}

const pool = mysql.createPool(dbConfig);

export default new Conext(pool);