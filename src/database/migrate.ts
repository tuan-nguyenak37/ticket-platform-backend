import { dataSource } from '../config/database/data-source';

async function migrate() {
  try {
    await dataSource.initialize();
    const applied = await dataSource.runMigrations({ transaction: 'all' });
    console.log(`Applied ${applied.length} migration(s)`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void migrate().catch(() => {
  console.error(
    'Database migration failed; check configuration and database availability.',
  );
  process.exitCode = 1;
});
