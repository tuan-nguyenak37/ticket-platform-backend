import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { seedEventCategories } from './event-categories.seed';

async function runSeed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    console.log('🌱 Bắt đầu seed danh mục sự kiện...');
    await seedEventCategories(dataSource);
    console.log('✅ Hoàn thành seed danh mục sự kiện thành công!');
  } catch (error) {
    console.error('❌ Lỗi khi seed dữ liệu:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

void runSeed();
