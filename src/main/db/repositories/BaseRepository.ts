import BetterSqlite3 from 'better-sqlite3'

export abstract class BaseRepository {
  constructor(protected readonly db: BetterSqlite3.Database) {}
}
