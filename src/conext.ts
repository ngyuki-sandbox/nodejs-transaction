import asyncHooks from 'async_hooks'

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
    private readonly context: {[eid: string]: { conn: TConnection, trx: number }} = {};

    private asyncHooks: asyncHooks.AsyncHook;

    constructor(private pool: TPool) {
        this.asyncHooks = asyncHooks.createHook({
            init: (asyncId, type, triggerAsyncId, resource) => {
                if (this.context[triggerAsyncId]) {
                    this.context[asyncId] = this.context[triggerAsyncId];
                }
            },
            destroy: (asyncId) => {
                delete this.context[asyncId];
            }
        }).enable();
    }

    async connection<T>(callback: (conn: TConnection) => Promise<T>) {
        const eid = asyncHooks.executionAsyncId();
        if (this.context[eid]) {
            return await callback(this.context[eid].conn);
        }
        const conn = await this.pool.getConnection();
        try {
            const eid = asyncHooks.executionAsyncId();
            this.context[eid] = { conn: conn, trx: 0 };
            try {
                return await callback(conn);
            } finally {
                delete this.context[eid];
            }
        } finally {
            conn.release();
        }
    }

    async transaction<T>(callback: (conn: TConnection) => Promise<T>) {
        return await this.connection(async (conn) => {
            const eid = asyncHooks.executionAsyncId();
            if (this.context[eid].trx === 0) {
                this.context[eid].trx++;
                await conn.beginTransaction();
                try {
                    const ret = await callback(conn);
                    await conn.commit();
                    return ret;
                } catch (err) {
                    await conn.rollback();
                    throw err;
                } finally {
                    this.context[eid].trx--;
                }
            } else {
                this.context[eid].trx++;
                try {
                    return await callback(conn);
                } finally {
                    this.context[eid].trx--;
                }
            }
        });
    }

    async end() {
        try {
            return await this.pool.end();
        } finally {
            this.asyncHooks.disable();
        }
    }
}
