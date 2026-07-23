import { openBetterSqlite3Driver } from '../driver.better-sqlite3';

describe('SqliteDriver (better-sqlite3 backend)', () => {
  it('round-trips a create-table / insert / select through the shim surface', () => {
    const driver = openBetterSqlite3Driver(':memory:');

    try {
      expect(driver.dialect).toBe('better-sqlite3');

      driver.execute('CREATE TABLE greeting (id INTEGER PRIMARY KEY, message TEXT NOT NULL)');

      const insertResult = driver.execute('INSERT INTO greeting (message) VALUES (?)', [
        'hello kyro',
      ]);
      expect(insertResult.changes).toBe(1);
      expect(insertResult.lastInsertRowId).toBe(1);

      const rows = driver.queryAll<{ id: number; message: string }>(
        'SELECT id, message FROM greeting WHERE id = ?',
        [1],
      );
      expect(rows).toEqual([{ id: 1, message: 'hello kyro' }]);
    } finally {
      driver.close();
    }
  });

  it('rolls back a transaction when the callback throws', () => {
    const driver = openBetterSqlite3Driver(':memory:');

    try {
      driver.execute('CREATE TABLE counter (n INTEGER NOT NULL)');
      driver.execute('INSERT INTO counter (n) VALUES (1)');

      expect(() =>
        driver.transaction(() => {
          driver.execute('UPDATE counter SET n = 2');
          throw new Error('boom');
        }),
      ).toThrow('boom');

      const rows = driver.queryAll<{ n: number }>('SELECT n FROM counter');
      expect(rows).toEqual([{ n: 1 }]);
    } finally {
      driver.close();
    }
  });
});
