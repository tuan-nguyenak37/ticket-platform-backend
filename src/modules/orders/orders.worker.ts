import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';

@Injectable()
export class OrdersWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly logger = new Logger(OrdersWorker.name);
  constructor(
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (!this.config.get<boolean>('ORDERS_WORKER_ENABLED', false)) return;
    this.timer = setInterval(() => this.tick(), 15000);
    this.timer.unref();
    this.tick();
  }
  private tick() {
    if (this.running) return;
    this.running = this.orders
      .sweep()
      .catch(() => {
        this.logger.error('Orders sweep failed');
      })
      .finally(() => {
        this.running = undefined;
      });
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
}
