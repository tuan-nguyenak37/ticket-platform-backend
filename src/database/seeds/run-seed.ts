import { dataSource } from '../../config/database/data-source';
import { seedEventCategories } from './event-categories.seed';

async function main() {
  if (process.argv.slice(2).join(' ') !== '--apply')
    throw new Error('Use npm run seed:categories -- --apply');
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? 'development'))
    throw new Error('Category seeding is restricted to development and test');
  try {
    await dataSource.initialize();
    await seedEventCategories(dataSource);
    console.log('Event category catalog updated.');
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void main().catch(() => {
  console.error(
    'Category seed failed. Check the target environment and applied migrations.',
  );
  process.exitCode = 1;
});
