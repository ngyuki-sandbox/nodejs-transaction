import { AsyncLocalStorage } from 'async_hooks'

interface Pool<T extends Connection> {
    getConnection(): Promise<T>,
    end(): Promise<void>;
}

interface Connection {
    beginTransaction(): Promise<void>,
    commit(): Promise<void>,
    rollback(): Promise<void>,
    release(): void,
}

type PromiseValue<T> = T extends Promise<infer V> ? V : never;

type PoolConnection<TPool extends Pool<Connection>> = PromiseValue<ReturnType<TPool["getConnection"]>>;

export class Conext<
    TPool extends Pool<TConnection>,
    TConnection extends Connection = PoolConnection<TPool>
> {
    private asyncLocalStorage: AsyncLocalStorage<{conn: TConnection, trx: number}>;

    constructor(private pool: TPool) {
        this.asyncLocalStorage = new AsyncLocalStorage();
    }

    async connection<T>(callback: (conn: TConnection) => Promise<T>) {
        const context = this.asyncLocalStorage.getStore();
        if (context) {
            return await callback(context.conn);
        }
        const conn = await this.pool.getConnection();
        try {
            const context = { conn: conn, trx: 0 };
            return await this.asyncLocalStorage.run(context, async () => {
                return await callback(conn);
            });
        } finally {
            conn.release();
        }
    }

    async transaction<T>(callback: (conn: TConnection) => Promise<T>) {
        return await this.connection(async (conn) => {
            const context = this.asyncLocalStorage.getStore()!;
            if (context.trx === 0) {
                context.trx++;
                await conn.beginTransaction();
                try {
                    const ret = await callback(conn);
                    await conn.commit();
                    return ret;
                } catch (err) {
                    await conn.rollback();
                    throw err;
                } finally {
                    context.trx--;
                }
            } else {
                context.trx++;
                try {
                    return await callback(conn);
                } finally {
                    context.trx--;
                }
            }
        });
    }

    async end() {
        try {
            return await this.pool.end();
        } finally {
            this.asyncLocalStorage.disable();
        }
    }
}
