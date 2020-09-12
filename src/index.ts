import db from './db'

(async () => {

    const func1 = async () => {
        // このスコープの中では同じコネクションが使用される
        await db.connection(async (conn) => {
            const [{cid}] = await conn.query('select connection_id() as cid');
            console.log(`${cid} -> func1`);

            await conn.query('select sleep(1)');
            await func2();
        });
    };

    const func2 = async () => {
        // ネストされたトランザクションは一番外側でのみ begin/commit される
        await db.transaction(async (conn) => {
            const [{cid}] = await conn.query('select connection_id() as cid');
            console.log(`${cid} -> func2`);

            await conn.query("insert into t (name) values ('aaa')");
            await conn.query('select sleep(1)');
            await func3();
        });
    };

    const func3 = async () => {
        // このトランザクションは func2 の内側なので begin/commit されない
        await db.transaction(async (conn) => {
            const [{cid}] = await conn.query('select connection_id() as cid');
            console.log(`${cid} -> func3`);

            await conn.query("insert into t (name) values ('zzz')");
        });
    };

    try {
        // 5並行で func1 -> func2 -> func3 を実行
        // 5接続しか使用されず func1/func2/func3 では同じ接続が使用される
        await Promise.all(Array.from(Array(5)).map(async () => func1()));

        // 30並行でクエリを実行
        // プールの接続数のデフォが10なので10接続しか使用されない
        // 1クエリで1秒かかるので合計で3秒ぐらいかかる
        const start = new Date().getTime();
        const ids = await Promise.all(Array.from(Array(30)).map(async () => {
            return await db.connection(async (conn) => {
                await conn.query('select sleep(1)');
                const [{cid}] = await conn.query('select connection_id() as cid');
                return cid;
            });
        }));
        console.log(`connection_ids:`, new Set(ids))
        console.log(`duration: ${new Date().getTime() - start} ms`);

    } catch (err) {
        console.error(err);
    } finally {
        await db.end();
    }
})()
