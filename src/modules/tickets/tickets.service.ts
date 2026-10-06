import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class TicketsService {
  constructor(private readonly dataSource: DataSource) {}
}
