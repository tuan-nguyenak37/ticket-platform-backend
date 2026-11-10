import { dataSource } from '../config/database/data-source';
import { seedSampleData } from './seeds/sample-data.seed';

async function migrate() {
  try {
    await dataSource.initialize();
    const applied = await dataSource.runMigrations({ transaction: 'all' });
    console.log(`Applied ${applied.length} migration(s)`);

    if (process.env.SEED_SAMPLE_DATA !== 'false') {
      await seedSampleData(dataSource);
    }
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void migrate().catch((err) => {
  console.error(
    'Database migration or seeding failed; check configuration and database availability.',
    err,
  );
  process.exitCode = 1;
});
