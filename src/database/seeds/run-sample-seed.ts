import { dataSource } from '../../config/database/data-source';
import { seedSampleData } from './sample-data.seed';

async function main() {
  try {
    await dataSource.initialize();
    await seedSampleData(dataSource);
    console.log('Sample data seed completed.');
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void main().catch((err) => {
  console.error('Sample data seed failed:', err);
  process.exitCode = 1;
});
